export type DocumentStatusPayload = {
  documentPublicId: string;
  knowledgeSpacePublicId: string;
  fileName: string;
  status: 'Ready' | 'Failed';
  updatedAt: string;
};

export abstract class IRealtimeNotifier {
  abstract notifyDocumentStatus(
    knowledgeSpaceId: number,
    payload: DocumentStatusPayload,
  ): void;
}
