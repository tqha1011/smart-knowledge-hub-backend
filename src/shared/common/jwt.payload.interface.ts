import { UUID } from 'crypto';
import { Request } from 'express';

export interface JwtPayload {
  email: string;
  sub: UUID;
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
}
