import { UUID } from 'crypto';
import { Request } from 'express';
import { SystemRole } from '../domain/enum';

export interface JwtPayload {
  type?: 'demo';
  demoSessionPublicId?: string;
  email: string;
  sub: UUID;
  role: SystemRole;
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
}
