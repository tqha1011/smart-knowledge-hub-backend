export class CacheKey {
  static generateDocumentListVersionKey(
    knowledgeSpacePublicId: string,
  ): string {
    return `document-list:${knowledgeSpacePublicId}:version`;
  }

  static generateDocumentListKey(
    knowledgeSpacePublicId: string,
    version: string,
    pageNumber: number,
    pageSize: number,
  ): string {
    return `document-list:${knowledgeSpacePublicId}:${version}:${pageNumber}:${pageSize}`;
  }

  static generateOtpKey(email: string): string {
    return `otp:${email}`;
  }

  static generateResetTokenKey(email: string): string {
    return `reset-token:${email}`;
  }
}
