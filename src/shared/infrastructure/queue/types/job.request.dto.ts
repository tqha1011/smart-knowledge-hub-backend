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
  // Map doesn't survive BullMQ's JSON serialization over Redis; store entries instead.
  userIdByEmail: [string, number][];
};
