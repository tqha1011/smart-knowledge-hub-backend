import { CommonDocumentType } from 'src/shared/domain/enum';

export type DocumentListResponseDto = {
  publicId: string;
  title: string;
  fileType: CommonDocumentType;
  lastUpdated: Date;
  category: {
    publicId: string;
    name: string;
  };
  updatedBy: {
    publicId: string;
    name: string;
    avatarUrl: string | null;
  };
  cited: number;
};
