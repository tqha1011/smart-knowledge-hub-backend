import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { CreateKnowledgeSpaceDto } from '../dtos/knowledgeSpace.request.dto';
import { GetKnowledgeSpaceType } from '../dtos/knowledgeSpace.response.dto';

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

  abstract getKnowledgeSpaceTypes(): Promise<
    Result<GetKnowledgeSpaceType[], AppError>
  >;
}
