export class CacheKey {
  static generateOtpKey(email: string): string {
    return `otp:${email}`;
  }

  static generateResetTokenKey(email: string): string {
    return `reset-token:${email}`;
  }
}
