import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe' })
  @ApiOkResponse({
    schema: { example: { status: 'ok' } },
  })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe with database connectivity check' })
  @ApiOkResponse({
    schema: { example: { status: 'ok', checks: { database: 'ok' } } },
  })
  async ready() {
    await this.healthService.checkDatabase();

    return {
      status: 'ok',
      checks: { database: 'ok' },
    };
  }
}
