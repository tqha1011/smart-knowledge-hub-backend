import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from 'src/shared/common/jwt.guard';
import { toHttpException } from 'src/shared/common/app-error.mapper';
import { AppError } from 'src/shared/common/errorCode';
import { DemoService } from '../application/demo.service';
import { AllowDemo } from './demo-access.decorator';
import type { DemoRequest } from './demo-access.guard';

@ApiTags('demo')
@Controller('api/auth')
export class DemoController {
  constructor(private readonly service: DemoService) {}
  @Get('demo-config')
  @ApiOperation({
    summary: 'Get public demo availability and example questions',
  })
  config() {
    return this.service.publicConfig();
  }
  @Post('demo-session')
  @UseGuards(ThrottlerGuard)
  @Throttle({ 'limitPerMinute-auth': { ttl: 60000, limit: 3 } })
  @ApiOperation({
    summary: 'Start a one-hour demo session without registration',
  })
  async create(@Req() request: DemoRequest) {
    try {
      return await this.service.create(
        request.ip ?? request.socket.remoteAddress ?? 'unknown',
      );
    } catch (error) {
      if (error instanceof AppError) throw toHttpException(error);
      throw error;
    }
  }
  @Get('demo-session')
  @UseGuards(JwtAuthGuard)
  @AllowDemo('session')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current demo session and remaining quota' })
  status(@Req() request: DemoRequest) {
    return this.service.status(request.user!.sub);
  }
  @Delete('demo-session')
  @UseGuards(JwtAuthGuard)
  @AllowDemo('session')
  @ApiBearerAuth()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke the current demo session' })
  revoke(@Req() request: DemoRequest) {
    return this.service.revoke(request.user!.sub);
  }
}
