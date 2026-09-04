export class CacheKey {
  static generateOtpKey(email: string): string {
    return `otp:${email}`;
  }
}
