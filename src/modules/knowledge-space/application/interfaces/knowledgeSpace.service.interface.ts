import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { PageResult, PaginationRequest } from 'src/shared/common/pagination';
import { CreateKnowledgeSpaceDto } from '../dtos/knowledgeSpace.request.dto';
import {
  GetUserKnowledgeSpace,
  UserSpaceData,
} from '../dtos/knowledgeSpace.response.dto';

export abstract class IKnowledgeSpaceService {
  abstract createKnowledgeSpace(
    userCreatePublicId: string,
    createKnowledgeSpaceDto: CreateKnowledgeSpaceDto,
  ): Promise<Result<undefined, AppError>>;

  abstract getUserKnowledgeSpaceRole(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<string | null, AppError>>;

  abstract updateKnowledgeSpace(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    updateKnowledgeSpaceDto: CreateKnowledgeSpaceDto,
  ): Promise<Result<undefined, AppError>>;

  abstract getKnowledgeSpaceForUser(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<GetUserKnowledgeSpace>, AppError>>;

  /** The caller must be a member (any role) of the knowledge space. */
  abstract getUserDataInKnowledgeSpaceAsync(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<UserSpaceData>, AppError>>;
}
