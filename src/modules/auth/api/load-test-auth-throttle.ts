import type { ExecutionContext } from '@nestjs/common';
import { AuthController } from './auth.controller';

export function shouldSkipLoadTestLoginThrottle(
  context: ExecutionContext,
): boolean {
  return (
    process.env.LOAD_TEST_AUTH_THROTTLE_BYPASS === 'true' &&
    process.env.LOAD_TEST_MOCK_AI === 'true' &&
    context.getClass() === AuthController &&
    context.getHandler() === AuthController.prototype.login
  );
}
