import { SystemRole } from 'src/shared/domain/enum';

export type UserResponseDto = {
  publicId: string;
  email: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserResponseWithPasswordDto = {
  publicId: string;
  email: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserInformationDto = {
  publicId: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: SystemRole;
};

export type UserInformationResponseDto = UserInformationDto & {
  avatarInitials: string;
  isAdmin: boolean;
};
