import { ConfigService } from '@nestjs/config';
import { demoOptions, isDemoActive, nextUtcDay } from './demo-policy';

describe('demo policy', () => {
  it('is opt-in with the agreed limits', () => {
    expect(demoOptions(new ConfigService())).toMatchObject({
      enabled: false,
      durationSeconds: 3600,
      questionLimit: 20,
      dailyQuestionLimit: 200,
    });
  });
  it('rejects invalid limits instead of removing a public quota', () => {
    expect(() =>
      demoOptions(new ConfigService({ DEMO_SESSION_QUESTION_LIMIT: '0' })),
    ).toThrow();
  });
  it('rejects revoked and expired sessions at the exact boundary', () => {
    const now = new Date('2026-10-09T23:59:59Z');
    expect(
      isDemoActive(
        { expiresAt: new Date('2026-10-10T00:00:00Z'), revokedAt: null },
        now,
      ),
    ).toBe(true);
    expect(isDemoActive({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(
      isDemoActive(
        { expiresAt: new Date('2026-10-10T00:00:00Z'), revokedAt: now },
        now,
      ),
    ).toBe(false);
  });
  it('resets at the next UTC midnight', () => {
    expect(nextUtcDay(new Date('2026-10-09T23:59:59Z')).toISOString()).toBe(
      '2026-10-10T00:00:00.000Z',
    );
  });
});
