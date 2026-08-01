import { UUID } from 'crypto';
import { KnowledgeSpaceType } from 'src/shared/domain/enum';

export type KnowledgeSpaceGetParams = {
  readonly id: number;
  readonly publicId: UUID;
  readonly name: string;
  readonly description: string;
  readonly createdAt: Date;
  readonly type: KnowledgeSpaceType;
  updatedAt: Date;
};

export type KnowledgeSpaceCreateParams = Omit<
  KnowledgeSpaceGetParams,
  'id' | 'publicId' | 'createdAt' | 'updatedAt'
>;

export class KnowledgeSpace {
  private constructor(private params: KnowledgeSpaceGetParams) {}
}
