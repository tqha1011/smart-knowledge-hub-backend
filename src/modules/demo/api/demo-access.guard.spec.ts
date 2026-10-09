import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DemoAccessGuard } from './demo-access.guard';
import { DemoRepository } from '../infrastructure/demo.repo';

describe('demo access boundary', () => {
  const space = '37c6da52-99f1-5465-a49c-6ec0cc721737';
  const payload = {
    sub: 'guest',
    email: 'guest@demo.invalid',
    role: 'employee',
    type: 'demo',
    demoSessionPublicId: 'session',
  };
  const identity = {
    publicId: 'session',
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
    knowledgeSpace: { publicId: space },
  };
  const verify = jest.fn();
  const find = jest.fn();
  const metadata = jest.fn();
  const context = (request: object) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => null,
      getClass: () => null,
    }) as unknown as ExecutionContext;
  const guard = () =>
    new DemoAccessGuard(
      { verifyAsync: verify } as unknown as JwtService,
      { findByUser: find } as unknown as DemoRepository,
      new ConfigService({ DEMO_ENABLED: 'true' }),
      { getAllAndOverride: metadata } as unknown as Reflector,
    );
  beforeEach(() => {
    verify.mockReset().mockResolvedValue(payload);
    find.mockReset().mockResolvedValue(identity);
    metadata.mockReset();
  });
  it('denies every route without explicit demo access', async () => {
    await expect(
      guard().canActivate(
        context({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('enforces the server-side space on reads and chat bodies', async () => {
    metadata.mockReturnValue('space');
    await expect(
      guard().canActivate(
        context({
          headers: { authorization: 'Bearer token' },
          params: { knowledgeSpacePublicId: 'other' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    metadata.mockReturnValue('chat');
    await expect(
      guard().canActivate(
        context({
          headers: { authorization: 'Bearer token' },
          body: { knowledgeSpacePublicId: 'other' },
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows an active guest and attaches its verified identity', async () => {
    metadata.mockReturnValue('space');
    const request = {
      headers: { authorization: 'Bearer token' },
      params: { knowledgeSpacePublicId: space },
      demoSession: undefined,
    };
    expect(await guard().canActivate(context(request))).toBe(true);
    expect(request.demoSession).toBe(identity);
  });
  it.each([
    'expired',
    'revoked',
    'missing claims',
    'wrong session',
    'wrong role',
    'disabled',
  ])('rejects %s identities', async (kind) => {
    metadata.mockReturnValue('self');
    if (kind === 'expired')
      find.mockResolvedValue({ ...identity, expiresAt: new Date(0) });
    if (kind === 'revoked')
      find.mockResolvedValue({ ...identity, revokedAt: new Date() });
    if (kind === 'missing claims')
      verify.mockResolvedValue({ sub: 'guest', role: 'employee' });
    if (kind === 'wrong session')
      verify.mockResolvedValue({ ...payload, demoSessionPublicId: 'other' });
    if (kind === 'wrong role')
      verify.mockResolvedValue({ ...payload, role: 'admin' });
    const subject =
      kind === 'disabled'
        ? new DemoAccessGuard(
            { verifyAsync: verify } as unknown as JwtService,
            { findByUser: find } as unknown as DemoRepository,
            new ConfigService(),
            { getAllAndOverride: metadata } as unknown as Reflector,
          )
        : guard();
    await expect(
      subject.canActivate(
        context({ headers: { authorization: 'Bearer token' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('preserves normal users and public requests', async () => {
    expect(await guard().canActivate(context({ headers: {} }))).toBe(true);
    find.mockResolvedValue(null);
    verify.mockResolvedValue({ sub: 'employee', role: 'employee' });
    expect(
      await guard().canActivate(
        context({ headers: { authorization: 'Bearer token' } }),
      ),
    ).toBe(true);
  });
});
