import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { AddKnowledgeSpaceTypeDto } from '../dtos/knowledgeSpace.request.dto';
import { GetKnowledgeSpaceType } from '../dtos/knowledgeSpace.response.dto';

export abstract class IKnowledgeSpaceTypeService {
  abstract getTypes(): Promise<Result<GetKnowledgeSpaceType[], AppError>>;

  abstract addNewType(
    addKnowledgeSpaceTypeDto: AddKnowledgeSpaceTypeDto,
  ): Promise<Result<undefined, AppError>>;
}
