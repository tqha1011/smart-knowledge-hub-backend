import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { CacheKey } from 'src/shared/domain/cacheKey';
import { IApplicationCache } from 'src/shared/infrastructure/cache/cache-manager.interface';
import { IKnowledgeSpaceTypeRepository } from '../../domain/repositories/knowledgeSpace-type.repo.interface';
import { AddKnowledgeSpaceTypeDto } from '../dtos/knowledgeSpace.request.dto';
import { GetKnowledgeSpaceType } from '../dtos/knowledgeSpace.response.dto';
import { IKnowledgeSpaceTypeService } from '../interfaces/knowledgeSpace-type.service.interface';

const TYPES_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class KnowledgeSpaceTypeService implements IKnowledgeSpaceTypeService {
  private readonly logger = new Logger(KnowledgeSpaceTypeService.name);
  constructor(
    private readonly knowledgeSpaceTypeRepository: IKnowledgeSpaceTypeRepository,
    private readonly cache: IApplicationCache,
  ) {}

  async getTypes(): Promise<Result<GetKnowledgeSpaceType[], AppError>> {
    try {
      let cacheKey: string | undefined;
      try {
        const version =
          (await this.cache.get<string>(
            CacheKey.generateKnowledgeSpaceTypesVersionKey(),
          )) ?? '0';
        cacheKey = CacheKey.generateKnowledgeSpaceTypesKey(version);
        const cached = await this.cache.get<string>(cacheKey);
        if (cached !== undefined && cached !== null) {
          const types = JSON.parse(cached) as GetKnowledgeSpaceType[];
          if (!Array.isArray(types)) {
            throw new Error('Invalid cached knowledge space types');
          }
          return ok(types);
        }
      } catch (error) {
        this.logger.warn('Failed to read knowledge space types cache', error);
      }
      const result = await this.knowledgeSpaceTypeRepository.getTypes();
      if (result.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            `Failed to get knowledge space types. ${result.error.message}`,
          ),
        );
      }
      if (cacheKey !== undefined) {
        try {
          // A concurrent mutation changes the version, making this snapshot unreachable.
          await this.cache.set(
            cacheKey,
            JSON.stringify(result.value),
            TYPES_CACHE_TTL_MS,
          );
        } catch (error) {
          this.logger.warn(
            'Failed to write knowledge space types cache',
            error,
          );
        }
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
      const versionKey = CacheKey.generateKnowledgeSpaceTypesVersionKey();
      let previousVersion: string | undefined;
      try {
        previousVersion = (await this.cache.get<string>(versionKey)) ?? '0';
      } catch (error) {
        this.logger.warn(
          'Failed to read knowledge space types cache version for invalidation',
          error,
        );
      }
      try {
        try {
          await this.cache.set(versionKey, randomUUID(), 0);
        } finally {
          if (previousVersion !== undefined) {
            await this.cache.delete(
              CacheKey.generateKnowledgeSpaceTypesKey(previousVersion),
            );
          }
        }
      } catch (error) {
        this.logger.warn(
          'Failed to invalidate knowledge space types cache',
          error,
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
