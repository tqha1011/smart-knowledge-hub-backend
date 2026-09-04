import {
  Controller,
  Get,
  HttpException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError, ErrorCode } from 'src/shared/common/errorCode';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import type { JwtPayload } from 'src/shared/common/jwt.payload.interface';
import { Roles } from 'src/shared/common/roles.decorator';
import { RolesGuard } from 'src/shared/common/roles.guard';
import { User } from 'src/shared/common/user.decorator';
import { SystemRole } from 'src/shared/domain/enum';
import { IUserService } from '../application/interfaces/user.service.interface';

@ApiTags('users')
@ApiBearerAuth()
@Controller('api/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  private readonly logger = new Logger(UserController.name);
  constructor(private readonly userService: IUserService) {}

  /**
   * Returns the authenticated user's own public information.
   * @throws {401} when no valid bearer token is provided.
   * @throws {404} when the authenticated user no longer exists.
   * @throws {500} for any unexpected error while fetching the information.
   * @example
   * GET /api/users/me
   */
  @ApiOperation({ summary: "Get the current user's information" })
  @ApiOkResponse({
    description: "The authenticated user's public information",
    schema: {
      example: {
        publicId: '6b1f2a4e-8c3d-4e2a-9f1b-3d5e7a9c1b2d',
        email: 'jane.doe@example.com',
        username: 'jane.doe',
        avatarUrl: 'https://www.gravatar.com/avatar/abc123?d=identicon',
        avatarInitials: 'J',
      },
    },
  })
  @Roles([SystemRole.Admin, SystemRole.Employee])
  @Get('me')
  async getMe(@User() user: JwtPayload) {
    const result = await this.userService.getUserInformation(user.sub);
    return result.match(
      (userInformation) => userInformation,
      (error: AppError) => {
        throw this.toHttpError(
          error,
          "fetching the current user's information",
        );
      },
    );
  }

  /**
   * Maps an `AppError` to its HTTP exception, logging the ones that indicate
   * a failure on our side rather than a bad request.
   */
  private toHttpError(error: AppError, action: string): HttpException {
    if (error.code === ErrorCode.InternalServerError) {
      this.logger.error(`Unexpected error while ${action}:`, error.stack);
    }
    return toHttpException(error);
  }
}
