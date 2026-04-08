import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { SystemConfigKey } from '../common/constants/system-config-keys.constants';
import { Permission } from '../common/enums';
import {
  SystemConfigEntryDto,
  UpdateSystemConfigDto,
} from './dto/system-config.dto';
import { SystemConfigService } from './system-config.service';

@ApiTags('Config')
@ApiBearerAuth()
@Controller('config/system')
export class SystemConfigController {
  constructor(private readonly systemConfig: SystemConfigService) {}

  @Get()
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({ summary: 'List all system config entries' })
  @ApiResponse({ status: 200, type: [SystemConfigEntryDto] })
  list(): Promise<SystemConfigEntryDto[]> {
    return this.systemConfig.list();
  }

  @Patch(':key')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({ summary: 'Update a system config entry' })
  async update(
    @Param('key') key: SystemConfigKey,
    @Body() dto: UpdateSystemConfigDto,
  ): Promise<{ ok: true }> {
    await this.systemConfig.setRaw(key, dto.value);
    return { ok: true };
  }
}
