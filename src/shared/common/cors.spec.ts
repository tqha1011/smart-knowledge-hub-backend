import { ALLOWED_ORIGINS, getAllowedOrigins } from './cors';

describe('shared HTTP and realtime origin policy', () => {
  const originalEnv = process.env;
  afterEach(() => {
    process.env = originalEnv;
  });
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://demo.example, https://portfolio.example',
    };
  });
  it('accepts exact configured origins and rejects local and suffix matches in production', () => {
    expect(getAllowedOrigins()).toEqual([
      'https://demo.example',
      'https://portfolio.example',
    ]);
    for (const origin of [
      'https://demo.example',
      'http://localhost:5173',
      'https://demo.example.evil.test',
    ]) {
      const callback = jest.fn();
      ALLOWED_ORIGINS(origin, callback);
      expect(callback).toHaveBeenCalledWith(
        null,
        origin === 'https://demo.example',
      );
    }
  });
  it('allows non-browser requests without an origin', () => {
    const callback = jest.fn();
    ALLOWED_ORIGINS(undefined, callback);
    expect(callback).toHaveBeenCalledWith(null, true);
  });
  it('does not silently accept paths or wildcards', () => {
    for (const value of [
      'https://demo.example/path',
      'https://demo.example/',
      '*',
    ]) {
      process.env.CORS_ALLOWED_ORIGINS = value;
      expect(() => getAllowedOrigins()).toThrow();
    }
  });
});
