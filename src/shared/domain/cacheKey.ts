export class CacheKey {
  static generateSimilarChunksVersionKey(knowledgeSpaceId: number): string {
    return `rag:similar-chunks:version:${knowledgeSpaceId}`;
  }

  static generateDocumentListVersionKey(
    knowledgeSpacePublicId: string,
  ): string {
    return `document-list:${knowledgeSpacePublicId}:version`;
  }

  static generateDocumentListKey(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    version: string,
    pageNumber: number,
    pageSize: number,
  ): string {
    return `document-list:${knowledgeSpacePublicId}:${userPublicId}:${version}:${pageNumber}:${pageSize}`;
  }

  static generateOtpKey(email: string): string {
    return `otp:${email}`;
  }

  static generateResetTokenKey(email: string): string {
    return `reset-token:${email}`;
  }
}
