import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { err, ok, Result } from 'neverthrow';
import { PrismaService } from 'src/shared/infrastructure/database/prisma.service';
import {
  IKnowledgeSpaceTypeRepository,
  TypeData,
} from '../domain/repositories/knowledgeSpace-type.repo.interface';

@Injectable()
export class KnowledgeSpaceTypeRepository implements IKnowledgeSpaceTypeRepository {
  private readonly logger = new Logger(KnowledgeSpaceTypeRepository.name);
  constructor(private readonly prismaService: PrismaService) {}

  async addNewType(name: string): Promise<Result<TypeData, Error>> {
    try {
      const publicId = randomUUID();
      await this.prismaService.knowledgeSpaceType.create({
        data: { publicId, name },
      });
      return ok({ publicId, name });
    } catch (error) {
      this.logger.error('Failed to add new type in repository', error);
      return err(new Error('Failed to add new type'));
    }
  }

  async getTypes(): Promise<Result<TypeData[], Error>> {
    try {
      const types = await this.prismaService.knowledgeSpaceType.findMany({
        select: { publicId: true, name: true },
      });
      return ok(types);
    } catch (error) {
      this.logger.error('Failed to get types in repository', error);
      return err(new Error('Failed to get types'));
    }
  }

  async getTypeIdByName(name: string): Promise<Result<number | null, Error>> {
    try {
      const type = await this.prismaService.knowledgeSpaceType.findUnique({
        where: { name },
        select: { id: true },
      });
      return ok(type?.id ?? null);
    } catch (error) {
      this.logger.error('Failed to get type id by name in repository', error);
      return err(new Error('Failed to get type id by name'));
    }
  }
}
