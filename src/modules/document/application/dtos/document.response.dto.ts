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

export type DocumentDetailResponseDto = {
  publicId: string;
  title: string;
  description: string | null;
  fileType: CommonDocumentType;
  fileSize: number;
  content: string | null;
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
  citedQuestion: {
    publicId: string;
    name: string;
    lastAsked: Date;
  }[]; // if doesn't have any cited question, return empty array
};
