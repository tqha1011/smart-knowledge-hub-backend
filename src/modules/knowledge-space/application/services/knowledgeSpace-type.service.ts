import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { IKnowledgeSpaceTypeRepository } from '../../domain/repositories/knowledgeSpace-type.repo.interface';
import { AddKnowledgeSpaceTypeDto } from '../dtos/knowledgeSpace.request.dto';
import { GetKnowledgeSpaceType } from '../dtos/knowledgeSpace.response.dto';
import { IKnowledgeSpaceTypeService } from '../interfaces/knowledgeSpace-type.service.interface';

@Injectable()
export class KnowledgeSpaceTypeService implements IKnowledgeSpaceTypeService {
  private readonly logger = new Logger(KnowledgeSpaceTypeService.name);
  constructor(
    private readonly knowledgeSpaceTypeRepository: IKnowledgeSpaceTypeRepository,
  ) {}

  async getTypes(): Promise<Result<GetKnowledgeSpaceType[], AppError>> {
    try {
      const result = await this.knowledgeSpaceTypeRepository.getTypes();
      if (result.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get knowledge space types. ${result.error.message}`,
          ),
        );
      }
      return ok(result.value);
    } catch (error) {
      this.logger.error('Failed to get knowledge space types', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get knowledge space types',
        ),
      );
    }
  }

  async addNewType(
    addKnowledgeSpaceTypeDto: AddKnowledgeSpaceTypeDto,
  ): Promise<Result<undefined, AppError>> {
    try {
      const existingTypeIdResult =
        await this.knowledgeSpaceTypeRepository.getTypeIdByName(
          addKnowledgeSpaceTypeDto.name,
        );
      if (existingTypeIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get knowledge space type id by name. ${existingTypeIdResult.error.message}`,
          ),
        );
      }
      if (existingTypeIdResult.value !== null) {
        return err(
          new AppError(
            ErrorCode.Conflict,
            `Knowledge space type ${addKnowledgeSpaceTypeDto.name} already exists`,
          ),
        );
      }

      const addResult = await this.knowledgeSpaceTypeRepository.addNewType(
        addKnowledgeSpaceTypeDto.name,
      );
      if (addResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to add new knowledge space type. ${addResult.error.message}`,
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to add new knowledge space type', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to add new knowledge space type',
        ),
      );
    }
  }
}
