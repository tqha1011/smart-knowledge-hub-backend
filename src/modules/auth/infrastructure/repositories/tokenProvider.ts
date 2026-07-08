import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ok, Result } from 'neverthrow';
import { ITokenProvider } from '../../domain/repositories/auth.repo.interface';

@Injectable()
export class TokenProvider implements ITokenProvider {
  constructor(private readonly jwtService: JwtService) {}
  async GenerateAccessToken(
    userPublicId: string,
    email: string,
  ): Promise<Result<string, Error>> {
    const payload = { sub: userPublicId, email };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET_KEY,
      expiresIn: '1h', // Token expires in 1 hour
    });
    return ok(accessToken);
  }
}
