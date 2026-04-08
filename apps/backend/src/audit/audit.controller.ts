import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../common/enums';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'List audit log entries (paginated, descending)' })
  async list(
    @Query('skip') skip = '0',
    @Query('take') take = '50',
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
  ) {
    const skipNum = Math.max(0, parseInt(skip, 10) || 0);
    const takeNum = Math.min(200, Math.max(1, parseInt(take, 10) || 50));

    const [items, total] = await Promise.all([
      this.audit.list({ skip: skipNum, take: takeNum, entity, entityId }),
      this.audit.count({ entity, entityId }),
    ]);

    return { total, skip: skipNum, take: takeNum, items };
  }
}
