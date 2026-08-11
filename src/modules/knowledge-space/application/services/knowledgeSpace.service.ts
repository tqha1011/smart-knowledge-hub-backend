import { Injectable, Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import {
  KnowledgeSpace,
  KnowledgeSpaceUpdateParams,
} from '../../domain/entities/knowledgeSpace.entity';
import { IKnowledgeSpaceRepository } from '../../domain/repositories/knowledgeSpace.repo.interface';
import {
  AddKnowledgeSpaceTypeDto,
  CreateKnowledgeSpaceDto,
} from '../dtos/knowledgeSpace.request.dto';
import { GetKnowledgeSpaceType } from '../dtos/knowledgeSpace.response.dto';
import { IKnowledgeSpaceQueryRepository } from '../interfaces/knowledgeSpace-query.repo.interface';
import { IKnowledgeSpaceService } from '../interfaces/knowledgeSpace.service.interface';

@Injectable()
export class KnowledgeSpaceService implements IKnowledgeSpaceService {
  constructor(
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly userRepository: IUserRepository,
    private readonly knowledgeSpaceQueryRepository: IKnowledgeSpaceQueryRepository,
  ) {}
  private readonly logger = new Logger(KnowledgeSpaceService.name);
  async getKnowledgeSpaceTypes(): Promise<
    Result<GetKnowledgeSpaceType[], AppError>
  > {
    try {
      const result =
        await this.knowledgeSpaceQueryRepository.getKnowledgeSpaceTypes();
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
  async addNewKnowledgeSpaceType(
    addKnowledgeSpaceTypeDto: AddKnowledgeSpaceTypeDto,
  ): Promise<Result<undefined, AppError>> {
    try {
      const existingTypeIdResult =
        await this.knowledgeSpaceQueryRepository.getKnowledgeSpaceTypeIdByName(
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

      const addResult =
        await this.knowledgeSpaceQueryRepository.addNewKnowledgeSpaceType(
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
  async createKnowledgeSpace(
    userCreatePublicId: string,
    createKnowledgeSpaceDto: CreateKnowledgeSpaceDto,
  ): Promise<Result<undefined, AppError>> {
    try {
      const userIdResult =
        await this.userRepository.GetUserIdByPublicId(userCreatePublicId);
      if (userIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get user ID by public ID. ${userIdResult.error.message}`,
          ),
        );
      }
      const userId = userIdResult.value;
      if (userId === null) {
        return err(
          new AppError(
            ErrorCode.NotFound,
            `User with public ID ${userCreatePublicId} not found`,
          ),
        );
      }

      const typeIdResult =
        await this.knowledgeSpaceRepository.getKnowledgeSpaceTypeIdByPublicId(
          createKnowledgeSpaceDto.typePublicId,
        );
      if (typeIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get knowledge space type id by public id. ${typeIdResult.error.message}`,
          ),
        );
      }
      const typeId = typeIdResult.value;
      if (typeId === null) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            `Knowledge space type ${createKnowledgeSpaceDto.typePublicId} does not exist`,
          ),
        );
      }

      const result = KnowledgeSpace.create({
        name: createKnowledgeSpaceDto.name,
        description: createKnowledgeSpaceDto.description ?? null,
        typeId,
      });
      if (result.isErr()) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            `Failed to create knowledge space. ${result.error.message}`,
          ),
        );
      }
      const knowledgeSpace = result.value;
      const createResult = await this.knowledgeSpaceRepository.create(
        knowledgeSpace,
        userId,
      );
      if (createResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to create knowledge space. ${createResult.error.message}`,
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to create knowledge space', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create knowledge space',
        ),
      );
    }
  }
  async getUserKnowledgeSpaceRole(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<string | null, AppError>> {
    try {
      const contextResult = await this.resolveUserAndKnowledgeSpaceId(
        userPublicId,
        knowledgeSpacePublicId,
      );
      if (contextResult.isErr()) {
        return err(contextResult.error);
      }
      const { userId, knowledgeSpaceId } = contextResult.value;

      const roleResult =
        await this.knowledgeSpaceRepository.getUserKnowledgeSpaceRole(
          userId,
          knowledgeSpaceId,
        );
      if (roleResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get user knowledge space role. ${roleResult.error.message}`,
          ),
        );
      }
      return ok(roleResult.value);
    } catch (error) {
      this.logger.error('Failed to get user knowledge space role', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to get user knowledge space role',
        ),
      );
    }
  }
  async updateKnowledgeSpace(
    userPublicId: string,
    knowledgeSpacePublicId: string,
    updateKnowledgeSpaceDto: CreateKnowledgeSpaceDto,
  ): Promise<Result<undefined, AppError>> {
    try {
      const contextResult = await this.resolveUserAndKnowledgeSpaceId(
        userPublicId,
        knowledgeSpacePublicId,
      );
      if (contextResult.isErr()) {
        return err(contextResult.error);
      }
      const { userId, knowledgeSpaceId } = contextResult.value;

      const roleResult =
        await this.knowledgeSpaceRepository.getUserKnowledgeSpaceRole(
          userId,
          knowledgeSpaceId,
        );
      if (roleResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get user knowledge space role. ${roleResult.error.message}`,
          ),
        );
      }
      if (roleResult.value !== KnowledgeSpaceRole.Owner) {
        return err(
          new AppError(
            ErrorCode.Forbidden,
            `Only the owner can update knowledge space ${knowledgeSpacePublicId}`,
          ),
        );
      }

      const typeIdResult =
        await this.knowledgeSpaceRepository.getKnowledgeSpaceTypeIdByPublicId(
          updateKnowledgeSpaceDto.typePublicId,
        );
      if (typeIdResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get knowledge space type id by public id. ${typeIdResult.error.message}`,
          ),
        );
      }
      const typeId = typeIdResult.value;
      if (typeId === null) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            `Knowledge space type ${updateKnowledgeSpaceDto.typePublicId} does not exist`,
          ),
        );
      }

      const updateParams: KnowledgeSpaceUpdateParams = {
        name: updateKnowledgeSpaceDto.name,
        description: updateKnowledgeSpaceDto.description ?? null,
        typeId,
      };
      const validationResult = KnowledgeSpace.validateUpdate(updateParams);
      if (validationResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            `Failed to update knowledge space. ${validationResult.error.message}`,
          ),
        );
      }

      const updateResult =
        await this.knowledgeSpaceRepository.updateKnowledgeSpace(
          knowledgeSpaceId,
          updateParams,
        );
      if (updateResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to update knowledge space. ${updateResult.error.message}`,
          ),
        );
      }
      return ok(undefined);
    } catch (error) {
      this.logger.error('Failed to update knowledge space', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to update knowledge space',
        ),
      );
    }
  }

  /**
   * Resolves both public ids to the internal ids the repositories work with.
   * Returns NotFound when either the user or the knowledge space does not exist.
   */
  private async resolveUserAndKnowledgeSpaceId(
    userPublicId: string,
    knowledgeSpacePublicId: string,
  ): Promise<Result<{ userId: number; knowledgeSpaceId: number }, AppError>> {
    const userIdResult =
      await this.userRepository.GetUserIdByPublicId(userPublicId);
    if (userIdResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to get user ID by public ID. ${userIdResult.error.message}`,
        ),
      );
    }
    const userId = userIdResult.value;
    if (userId === null) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          `User with public ID ${userPublicId} not found`,
        ),
      );
    }

    const knowledgeSpaceIdResult =
      await this.knowledgeSpaceRepository.getKnowledgeSpaceIdByPublicId(
        knowledgeSpacePublicId,
      );
    if (knowledgeSpaceIdResult.isErr()) {
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          `Failed to get knowledge space ID by public ID. ${knowledgeSpaceIdResult.error.message}`,
        ),
      );
    }
    const knowledgeSpaceId = knowledgeSpaceIdResult.value;
    if (knowledgeSpaceId === null) {
      return err(
        new AppError(
          ErrorCode.NotFound,
          `Knowledge space with public ID ${knowledgeSpacePublicId} not found`,
        ),
      );
    }

    return ok({ userId, knowledgeSpaceId });
  }
}
