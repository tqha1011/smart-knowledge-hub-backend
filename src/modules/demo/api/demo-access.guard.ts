import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { SystemRole } from 'src/shared/domain/enum';
import { DemoIdentity, DemoRepository } from '../infrastructure/demo.repo';
import { demoOptions, isDemoActive } from '../domain/demo-policy';
import { DEMO_ACCESS, DemoScope } from './demo-access.decorator';

export type DemoRequest = Request & {
  demoSession?: DemoIdentity;
  user?: JwtPayload;
};

@Injectable()
export class DemoAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly repo: DemoRepository,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<DemoRequest>();
    const header = request.headers.authorization;
    if (!header) return true;
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('Invalid token.');
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Session expired or invalid.');
    }
    if (typeof payload.sub !== 'string')
      throw new UnauthorizedException('Invalid token.');
    const identity = await this.repo.findByUser(payload.sub);
    if (payload.type !== 'demo' && !identity) return true;
    const options = demoOptions(this.config);
    if (
      !options.enabled ||
      !identity ||
      !isDemoActive(identity) ||
      payload.type !== 'demo' ||
      payload.role !== SystemRole.Employee ||
      payload.demoSessionPublicId !== identity.publicId ||
      identity.knowledgeSpace.publicId !== options.spacePublicId
    )
      throw new UnauthorizedException('Demo session expired or invalid.');
    const scope = this.reflector.getAllAndOverride<DemoScope>(DEMO_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!scope)
      throw new ForbiddenException(
        'This action is not available in demo mode.',
      );
    const body = request.body as
      | { knowledgeSpacePublicId?: unknown }
      | undefined;
    const space =
      scope === 'space'
        ? request.params?.knowledgeSpacePublicId
        : scope === 'chat'
          ? body?.knowledgeSpacePublicId
          : options.spacePublicId;
    if (space !== options.spacePublicId)
      throw new ForbiddenException(
        'Demo access is limited to its knowledge space.',
      );
    request.demoSession = identity;
    request.user = payload;
    return true;
  }
}
