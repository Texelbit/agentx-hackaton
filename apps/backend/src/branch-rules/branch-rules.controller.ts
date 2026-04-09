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
  JiraStatusOptionDto,
  ReorderBranchRulesDto,
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

  @Get('jira-statuses')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({
    summary:
      'List every Jira status known for the configured project. Used by the dashboard to manually pick a status for unlinked rules.',
  })
  @ApiResponse({ status: 200, type: [JiraStatusOptionDto] })
  listJiraStatuses(): Promise<JiraStatusOptionDto[]> {
    return this.rules.listJiraStatuses();
  }

  @Get('github-branches')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({
    summary:
      'List every branch in the configured GitHub repo. Powers the "base branch" combobox in the rules form.',
  })
  listGithubBranches(): Promise<string[]> {
    return this.rules.listGithubBranches();
  }

  @Post()
  @RequirePermission(Permission.CONFIG_MANAGE)
  @ApiOperation({ summary: 'Create a branch state rule' })
  @ApiResponse({ status: 201, type: BranchRuleDto })
  create(@Body() dto: CreateBranchRuleDto): Promise<BranchRuleDto> {
    return this.rules.create(dto);
  }

  @Post('reorder')
  @RequirePermission(Permission.CONFIG_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Bulk-reorder rules by passing an ordered list of ids. Position becomes priority.',
  })
  @ApiResponse({ status: 200, type: [BranchRuleDto] })
  reorder(@Body() dto: ReorderBranchRulesDto): Promise<BranchRuleDto[]> {
    return this.rules.reorder(dto.ids);
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
      "Re-resolve every rule's jiraStatusId from the current jira_status_mappings",
  })
  resync(): Promise<{ resolved: number; missing: number }> {
    return this.rules.resyncJiraStatuses();
  }
}
