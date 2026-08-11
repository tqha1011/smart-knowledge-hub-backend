import { Result } from 'neverthrow';
import { GetKnowledgeSpaceType } from '../dtos/knowledgeSpace.response.dto';

export abstract class IKnowledgeSpaceQueryRepository {
  abstract getKnowledgeSpaceTypes(): Promise<
    Result<GetKnowledgeSpaceType[], Error>
  >;
}
