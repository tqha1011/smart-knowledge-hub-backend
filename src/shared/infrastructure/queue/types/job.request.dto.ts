import { AddMemberRequestDto } from 'src/modules/knowledge-space/application/dtos/knowledgeSpace.request.dto';

export type IngestionJobRequestDto = {
  documentPublicId: string;
};

export type GenerateTitleJobRequestDto = {
  chatSessionPublicId: string;
  knowledgeSpacePublicId: string;
};

export type SendEmailJobRequestDto = {
  inviterPublicId: string;
  knowledgeSpaceId: number;
  members: AddMemberRequestDto[];
  userIdByEmail: Map<string, number>;
};
