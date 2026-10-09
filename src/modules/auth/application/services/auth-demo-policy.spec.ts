import { ok } from 'neverthrow';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { ErrorCode } from 'src/shared/common/errorCode';

describe('admin provisioning and disabled email', () => {
  const add = jest.fn();
  const send = jest.fn();
  function service() {
    return new AuthService(
      {
        GenerateHashPassword: jest.fn().mockResolvedValue(ok('hashed')),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        CheckUserExistsByEmail: jest
          .fn()
          .mockResolvedValue({ isErr: () => false, value: false }),
        AddUser: add,
        GetUserByEmail: jest.fn().mockResolvedValue(ok(null)),
      } as never,
      { sendMail: send } as never,
      new ConfigService({ EMAIL_ENABLED: 'false' }),
      {} as never,
      {} as never,
    );
  }
  beforeEach(() => {
    add.mockReset().mockResolvedValue(ok(undefined));
    send.mockReset();
  });
  it('disables self registration by default', async () => {
    const result = await service().registerAsync({
      email: 'someone@example.com',
      username: 'someone',
      password: 'Password123!',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe(ErrorCode.Forbidden);
    expect(add).not.toHaveBeenCalled();
  });
  it('fails before creating an account whose password cannot be delivered', async () => {
    const result = await service().adminCreateUserAsync({
      email: 'someone@example.com',
      username: 'someone',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr())
      expect(result.error.code).toBe(ErrorCode.ServiceUnavailable);
    expect(add).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it.each(['sendOtpAsync', 'verifyOtpAsync', 'recoverPasswordAsync'] as const)(
    'blocks %s when email is unavailable',
    async (method) => {
      const args: [string, string, string] = [
        'someone@example.com',
        '123456',
        'Password123!',
      ];
      const result = await service()[method](...args);
      expect(result.isErr()).toBe(true);
      if (result.isErr())
        expect(result.error.code).toBe(ErrorCode.ServiceUnavailable);
    },
  );
});
