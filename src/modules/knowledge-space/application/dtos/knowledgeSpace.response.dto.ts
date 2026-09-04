import { KnowledgeSpaceRole } from 'src/shared/domain/enum';

export type GetKnowledgeSpaceType = {
  publicId: string;
  name: string;
};

export type GetUserKnowledgeSpace = {
  publicId: string;
  name: string;
  totalDocuments: number;
  typeName: string;
  role: KnowledgeSpaceRole;
};

export type UserSpaceData = {
  publicId: string;
  name: string;
  email: string;
  role: KnowledgeSpaceRole;
  joinedAt: Date;
};
