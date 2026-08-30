import {
  CommonDocumentType,
  CommonDocumentVisibility,
} from 'src/shared/domain/enum';

export type DocumentUploadUrlResponseDto = {
  uploadUrl: string;
  /** Send this back with the create request so the server can find the uploaded file. */
  storageKey: string;
  expiresAt: Date;
};

export type DocumentListResponseDto = {
  publicId: string;
  title: string;
  fileType: CommonDocumentType;
  visibility: CommonDocumentVisibility;
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
