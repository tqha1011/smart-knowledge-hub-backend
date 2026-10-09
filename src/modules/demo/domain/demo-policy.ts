import { ConfigService } from '@nestjs/config';

export function demoOptions(config: ConfigService) {
  const positive = (key: string, fallback: number) => {
    const value = Number(config.get<string>(key) ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${key} must be a positive integer`);
    return value;
  };
  return {
    enabled: config.get<string>('DEMO_ENABLED') === 'true',
    spacePublicId:
      config.get<string>('DEMO_KNOWLEDGE_SPACE_PUBLIC_ID') ??
      '37c6da52-99f1-5465-a49c-6ec0cc721737',
    durationSeconds: positive('DEMO_SESSION_TTL_SECONDS', 3600),
    questionLimit: positive('DEMO_SESSION_QUESTION_LIMIT', 20),
    dailyQuestionLimit: positive('DEMO_DAILY_QUESTION_LIMIT', 200),
  };
}
export function isDemoActive(
  session: { expiresAt: Date; revokedAt: Date | null },
  now = new Date(),
): boolean {
  return (
    session.revokedAt === null && session.expiresAt.getTime() > now.getTime()
  );
}
export function nextUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}
export const DEMO_SAMPLE_QUESTIONS = [
  'Theo tài liệu “Mây Trắng — Giới hạn thời gian API.md” của dự án Mây Trắng, timeout và số lần thử lại tối đa là bao nhiêu?',
  'Theo tài liệu “Mây Trắng — Lưu bản nháp biểu mẫu.md” của dự án Mây Trắng, chu kỳ lưu và hạn dùng của bản nháp là bao nhiêu?',
  'Theo tài liệu “Mây Trắng — Pool và timeout truy vấn.md” của dự án Mây Trắng, pool tối đa và statement_timeout là bao nhiêu?',
];
