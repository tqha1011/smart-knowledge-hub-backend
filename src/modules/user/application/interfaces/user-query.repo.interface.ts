import { Result } from 'neverthrow';
import { UserInformationDto } from '../dtos/user.response.dto';

export abstract class IUserQueryRepository {
  abstract getUserInformationByPublicId(
    publicId: string,
  ): Promise<Result<UserInformationDto | null, Error>>;
}
