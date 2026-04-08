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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AgentRole, Permission } from '../common/enums';
import { AssignModelDto, LlmAssignmentDto } from './dto/llm-config.dto';
import {
  CreateLlmModelDto,
  LlmModelDto,
  UpdateLlmModelDto,
} from './dto/llm-model.dto';
import {
  CreateLlmProviderDto,
  LlmProviderDto,
  UpdateLlmProviderDto,
} from './dto/llm-provider.dto';
import { LlmConfigService } from './llm-config.service';
import { LlmModelsService } from './llm-models.service';
import { LlmProvidersService } from './llm-providers.service';

/**
 * `/config/llm/*` — three sub-resources gated by `llm:manage`:
 *
 *   /providers     — CRUD over LlmProvider
 *   /models        — CRUD over LlmModel (filterable by providerId)
 *   /assignments   — current agent role → model mapping (read + assign)
 */
@ApiTags('Config')
@ApiBearerAuth()
@Controller('config/llm')
export class LlmConfigController {
  constructor(
    private readonly llmConfig: LlmConfigService,
    private readonly providers: LlmProvidersService,
    private readonly models: LlmModelsService,
  ) {}

  // ── Providers ────────────────────────────────────────────────────────

  @Get('providers')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'List all LLM providers' })
  @ApiResponse({ status: 200, type: [LlmProviderDto] })
  listProviders(): Promise<LlmProviderDto[]> {
    return this.providers.findAll();
  }

  @Post('providers')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'Create a new LLM provider' })
  @ApiResponse({ status: 201, type: LlmProviderDto })
  createProvider(@Body() dto: CreateLlmProviderDto): Promise<LlmProviderDto> {
    return this.providers.create(dto);
  }

  @Patch('providers/:id')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'Update an LLM provider' })
  updateProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLlmProviderDto,
  ): Promise<LlmProviderDto> {
    return this.providers.update(id, dto);
  }

  @Delete('providers/:id')
  @RequirePermission(Permission.LLM_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an LLM provider' })
  async removeProvider(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.providers.remove(id);
  }

  // ── Models ───────────────────────────────────────────────────────────

  @Get('models')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'List all LLM models (optionally filtered by provider)' })
  @ApiResponse({ status: 200, type: [LlmModelDto] })
  listModels(@Query('providerId') providerId?: string): Promise<LlmModelDto[]> {
    return this.models.findAll(providerId);
  }

  @Post('models')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'Create a new LLM model' })
  @ApiResponse({ status: 201, type: LlmModelDto })
  createModel(@Body() dto: CreateLlmModelDto): Promise<LlmModelDto> {
    return this.models.create(dto);
  }

  @Patch('models/:id')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'Update an LLM model' })
  updateModel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLlmModelDto,
  ): Promise<LlmModelDto> {
    return this.models.update(id, dto);
  }

  @Delete('models/:id')
  @RequirePermission(Permission.LLM_MANAGE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an LLM model' })
  async removeModel(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.models.remove(id);
  }

  // ── Assignments (agent role → model) ─────────────────────────────────

  @Get('assignments')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'List the current LLM model assigned to each agent role' })
  @ApiResponse({ status: 200, type: [LlmAssignmentDto] })
  listAssignments(): Promise<LlmAssignmentDto[]> {
    return this.llmConfig.listAssignments();
  }

  @Patch('assignments/:role')
  @RequirePermission(Permission.LLM_MANAGE)
  @ApiOperation({ summary: 'Assign an LLM model to an agent role' })
  async assignModel(
    @Param('role') role: AgentRole,
    @Body() dto: AssignModelDto,
  ): Promise<{ ok: true }> {
    await this.llmConfig.assignModel(role, dto.modelId);
    return { ok: true };
  }
}
