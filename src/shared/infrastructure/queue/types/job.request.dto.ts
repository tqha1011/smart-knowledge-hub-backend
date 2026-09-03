export type IngestionJobRequestDto = {
  documentPublicId: string;
};

export type GenerateTitleJobRequestDto = {
  chatSessionPublicId: string;
  knowledgeSpacePublicId: string;
};
