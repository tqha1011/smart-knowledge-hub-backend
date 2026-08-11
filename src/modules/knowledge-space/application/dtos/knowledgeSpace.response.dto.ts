import { KnowledgeSpaceRole } from 'src/shared/domain/enum';

export type GetKnowledgeSpaceType = {
  publicId: string;
  name: string;
};

export type GetUserKnowledgeSpace = {
  publicId: string;
  name: string;
  totalDocuments: number;
  role: KnowledgeSpaceRole;
};
