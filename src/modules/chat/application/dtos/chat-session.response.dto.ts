import { CommonChatRole } from 'src/shared/domain/enum';

export type CreatedChatSessionData = {
  publicId: string;
  title: string;
};

export type ChatSessionListData = {
  publicId: string;
  title: string;
  updatedAt: Date;
};

export type ChatSessionDetailData = {
  publicId: string;
  title: string;
  createdAt: Date;
};

export type ChatMessageListData = {
  publicId: string;
  role: CommonChatRole;
  content: string;
  createdAt: Date;
};
