import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiGoneResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

export function DocumentTrashErrors(documentParam = true, restore = false) {
  return applyDecorators(
    ApiParam({ name: 'knowledgeSpacePublicId', type: String, format: 'uuid' }),
    ...(documentParam
      ? [ApiParam({ name: 'documentPublicId', type: String, format: 'uuid' })]
      : []),
    ApiBadRequestResponse({ description: 'Invalid UUID or pagination' }),
    ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' }),
    ApiForbiddenResponse({
      description:
        'Editor or Owner membership required, including Restricted documents',
    }),
    ApiNotFoundResponse({
      description: 'Document does not exist in this space',
    }),
    ...(documentParam
      ? [
          ApiConflictResponse({
            description: restore
              ? 'Document is already active'
              : 'Document is the current system FAQ',
          }),
        ]
      : []),
    ...(restore
      ? [
          ApiGoneResponse({
            description:
              'Retention deadline reached, purge started, or already purged',
          }),
        ]
      : []),
    ApiInternalServerErrorResponse({ description: 'Database failure' }),
  );
}

export const documentListSchema = {
  type: 'object' as const,
  required: [
    'publicId',
    'title',
    'fileType',
    'status',
    'visibility',
    'lastUpdated',
    'category',
    'updatedBy',
    'cited',
  ],
  properties: {
    publicId: { type: 'string', format: 'uuid' },
    title: { type: 'string' },
    fileType: { type: 'string', enum: ['PDF', 'DOCX', 'TXT', 'MD'] },
    status: { type: 'string', enum: ['Ready', 'Failed', 'Processing'] },
    visibility: { type: 'string', enum: ['Public', 'Restricted'] },
    lastUpdated: { type: 'string', format: 'date-time' },
    category: {
      type: 'object',
      properties: {
        publicId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
      },
    },
    updatedBy: {
      type: 'object',
      properties: {
        publicId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        avatarUrl: { type: 'string', nullable: true },
      },
    },
    cited: { type: 'integer' },
  },
};
export const trashPageSchema = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array',
      items: {
        ...documentListSchema,
        required: [...documentListSchema.required, 'deletedAt', 'purgeAfter'],
        properties: {
          ...documentListSchema.properties,
          deletedAt: { type: 'string', format: 'date-time' },
          purgeAfter: { type: 'string', format: 'date-time' },
        },
      },
    },
    totalPages: { type: 'integer' },
    currentPage: { type: 'integer' },
    pageNumber: { type: 'integer' },
    pageSize: { type: 'integer' },
    hasPrevious: { type: 'boolean' },
    hasNext: { type: 'boolean' },
  },
};
