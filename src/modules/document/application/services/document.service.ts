import { Logger } from '@nestjs/common';
import { err, ok, Result } from 'neverthrow';
import { ICategoryRepository } from 'src/modules/category/domain/repositories/category.repo.interface';
import { authorizeMembership } from 'src/modules/knowledge-space/application/services/authorizeMembership';
import { IKnowledgeSpaceRepository } from 'src/modules/knowledge-space/domain/repositories/knowledgeSpace.repo.interface';
import { IUserRepository } from 'src/modules/user/domain/repositories/user.repo.interface';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { KnowledgeSpaceRole } from 'src/shared/domain/enum';
import { Document } from '../../domain/entities/document.entity';
import { IDocumentRepository } from '../../domain/repositories/document.repo.interface';
import { DocumentCreateRequestDto } from '../dtos/document.request.dto';
import { DocumentListResponseDto } from '../dtos/document.response.dto';
import { IDocumentService } from '../interfaces/document.service.interface';

export class DocumentService implements IDocumentService {
  private readonly logger = new Logger(DocumentService.name);
  constructor(
    private readonly documentRepository: IDocumentRepository,
    private readonly knowledgeSpaceRepository: IKnowledgeSpaceRepository,
    private readonly categoryRepository: ICategoryRepository,
    private readonly userRepository: IUserRepository,
  ) {}
  async createDocumentAsync(
    knowledgeSpacePublicId: string,
    userPublicId: string,
    documentCreateRequestDto: DocumentCreateRequestDto,
  ): Promise<Result<DocumentListResponseDto, AppError>> {
    try {
      const membership = authorizeMembership(
        await this.knowledgeSpaceRepository.getMembershipInKnowledgeSpace(
          userPublicId,
          knowledgeSpacePublicId,
        ),
        KnowledgeSpaceRole.Editor,
        'create document',
      );

      if (membership.isErr()) {
        return err(membership.error);
      }

      const categoryResult =
        await this.categoryRepository.getCategoryIdByPublicId(
          documentCreateRequestDto.categoryPublicId,
          membership.value.knowledgeSpaceId,
        );

      if (categoryResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve category',
          ),
        );
      }

      if (categoryResult.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Category not found'));
      }

      const authorData =
        await this.userRepository.GetUserDataByPublicId(userPublicId);
      if (authorData.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to resolve author data',
          ),
        );
      }

      if (authorData.value === null) {
        return err(new AppError(ErrorCode.NotFound, 'Author not found'));
      }
      const categoryId = categoryResult.value.id;

      // code for upload document to storage and save document metadata to database
      const newDocument = Document.createDocument({
        title: documentCreateRequestDto.name,
        description: documentCreateRequestDto.description ?? null,
        content: documentCreateRequestDto.content ?? null,
        knowledgeSpaceId: membership.value.knowledgeSpaceId,
        authorId: membership.value.userId,
        categoryId: categoryId,
      });
      if (newDocument.isErr()) {
        return err(
          new AppError(
            ErrorCode.BadRequest,
            'Failed to create document entity',
          ),
        );
      }
      const addDocumentResult = await this.documentRepository.addDocument(
        newDocument.value,
      );
      if (addDocumentResult.isErr()) {
        return err(
          new AppError(
            ErrorCode.InternalServerError,
            'Failed to add document to repository',
          ),
        );
      }
      const documentListResponseDto: DocumentListResponseDto = {
        publicId: newDocument.value.publicId,
        title: newDocument.value.title,
        fileType: newDocument.value.fileType,
        lastUpdated: newDocument.value.updatedAt,
        category: {
          publicId: documentCreateRequestDto.categoryPublicId,
          name: categoryResult.value.name,
        },
        updatedBy: {
          publicId: userPublicId,
          name: authorData.value.name,
          avatarUrl: authorData.value.avatarUrl,
        },
        cited: 0,
      };
      return ok(documentListResponseDto);
    } catch (error) {
      this.logger.error('Failed to create document', error);
      return err(
        new AppError(
          ErrorCode.InternalServerError,
          'Failed to create document',
        ),
      );
    }
  }
}
