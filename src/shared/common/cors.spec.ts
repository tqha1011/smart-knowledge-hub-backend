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
    delete process.env.FRONTEND_URL;
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
  it('allows the frontend origin in production without a separate CORS list', () => {
    process.env.FRONTEND_URL = 'https://frontend.example/login';
    delete process.env.CORS_ALLOWED_ORIGINS;

    for (const [origin, allowed] of [
      ['https://frontend.example', true],
      ['https://frontend.example.evil.test', false],
      ['http://localhost:5173', false],
    ] as const) {
      let result: boolean | undefined;
      ALLOWED_ORIGINS(origin, (_error, allow) => {
        result = allow;
      });
      expect(result).toBe(allowed);
    }
  });
  it('merges and deduplicates the frontend and additional configured origins', () => {
    process.env.FRONTEND_URL = ' https://demo.example/ ';
    expect(getAllowedOrigins()).toEqual([
      'https://demo.example',
      'https://portfolio.example',
    ]);
    process.env.FRONTEND_URL = 'https://frontend.example';
    expect(getAllowedOrigins()).toContain('https://frontend.example');
    expect(getAllowedOrigins()).toContain('https://portfolio.example');
  });
  it('keeps local development origins alongside the configured frontend', () => {
    process.env.NODE_ENV = 'development';
    process.env.FRONTEND_URL = 'https://frontend.example';
    expect(getAllowedOrigins()).toContain('http://localhost:5173');
    expect(getAllowedOrigins()).toContain('https://frontend.example');
  });
  it('rejects invalid frontend URLs and non-HTTP protocols', () => {
    for (const value of [
      '*',
      'ftp://frontend.example',
      'javascript:alert(1)',
    ]) {
      process.env.FRONTEND_URL = value;
      expect(() => getAllowedOrigins()).toThrow();
    }
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
