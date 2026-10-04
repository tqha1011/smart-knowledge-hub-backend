import type { ExecutionContext } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { shouldSkipLoadTestLoginThrottle } from './load-test-auth-throttle';

describe('load-test login throttle', () => {
  const originalBypass = process.env.LOAD_TEST_AUTH_THROTTLE_BYPASS;
  const originalMockAi = process.env.LOAD_TEST_MOCK_AI;

  afterEach(() => {
    if (originalBypass === undefined)
      delete process.env.LOAD_TEST_AUTH_THROTTLE_BYPASS;
    else process.env.LOAD_TEST_AUTH_THROTTLE_BYPASS = originalBypass;
    if (originalMockAi === undefined) delete process.env.LOAD_TEST_MOCK_AI;
    else process.env.LOAD_TEST_MOCK_AI = originalMockAi;
  });

  function context(route: 'login' | 'refresh' | 'logout'): ExecutionContext {
    return {
      getClass: () => AuthController,
      getHandler: () => Reflect.get(AuthController.prototype, route),
    } as ExecutionContext;
  }

  it.each([
    ['false', 'false', false],
    ['true', 'false', false],
    ['false', 'true', false],
    ['true', 'true', true],
  ])(
    'skips login only when bypass=%s and mock AI=%s',
    (bypass, mockAi, expected) => {
      process.env.LOAD_TEST_AUTH_THROTTLE_BYPASS = bypass;
      process.env.LOAD_TEST_MOCK_AI = mockAi;
      expect(shouldSkipLoadTestLoginThrottle(context('login'))).toBe(expected);
    },
  );

  it('keeps refresh and other auth routes throttled with both flags enabled', () => {
    process.env.LOAD_TEST_AUTH_THROTTLE_BYPASS = 'true';
    process.env.LOAD_TEST_MOCK_AI = 'true';
    expect(shouldSkipLoadTestLoginThrottle(context('refresh'))).toBe(false);
    expect(shouldSkipLoadTestLoginThrottle(context('logout'))).toBe(false);
  });
});
