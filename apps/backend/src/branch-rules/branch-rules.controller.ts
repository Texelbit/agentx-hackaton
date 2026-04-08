import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../common/enums';
import { BranchRulesService } from './branch-rules.service';
import {
  BranchRuleDto,
  CreateBranchRuleDto,
  UpdateBranchRuleDto,
} from './dto/branch-rule.dto';

@ApiTags('Config')
@ApiBearerAuth()
@Controller('config/branch-rules')
export class BranchRulesController {
  constructor(private readonly rules: BranchRulesService) {}

  @Get()
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({ summary: 'List all branch state rules ordered by priority' })
  @ApiResponse({ status: 200, type: [BranchRuleDto] })
  findAll(): Promise<BranchRuleDto[]> {
    return this.rules.findAll();
  }

  @Post()
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({ summary: 'Create a branch state rule' })
  @ApiResponse({ status: 201, type: BranchRuleDto })
  create(@Body() dto: CreateBranchRuleDto): Promise<BranchRuleDto> {
    return this.rules.create(dto);
  }

  @Patch(':id')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({ summary: 'Update a branch state rule' })
  @ApiResponse({ status: 200, type: BranchRuleDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchRuleDto,
  ): Promise<BranchRuleDto> {
    return this.rules.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a branch state rule' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rules.remove(id);
  }

  @Post('resync-jira')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({
    summary:
      'Re-resolve every rule\'s jiraStatusId from the current jira_status_mappings',
  })
  resync(): Promise<{ resolved: number; missing: number }> {
    return this.rules.resyncJiraStatuses();
  }
}
