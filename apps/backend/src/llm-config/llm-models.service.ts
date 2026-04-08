import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLlmModelDto,
  LlmModelDto,
  UpdateLlmModelDto,
} from './dto/llm-model.dto';
import { LlmConfigService } from './llm-config.service';

/**
 * CRUD over `llm_models`. Each model belongs to one provider and exposes
 * a (name, value) pair where:
 *   - `name` = friendly label shown in the dashboard ("Gemini 2.5 Flash")
 *   - `value` = the actual API model identifier ("gemini-2.5-flash")
 */
@Injectable()
export class LlmModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmConfig: LlmConfigService,
  ) {}

  async findAll(providerId?: string): Promise<LlmModelDto[]> {
    const list = await this.prisma.llmModel.findMany({
      where: providerId ? { providerId } : undefined,
      orderBy: [{ providerId: 'asc' }, { name: 'asc' }],
    });
    return list.map(LlmModelDto.fromEntity);
  }

  async findById(id: string): Promise<LlmModelDto> {
    const m = await this.prisma.llmModel.findUnique({ where: { id } });
    if (!m) throw new NotFoundException(`LlmModel ${id} not found`);
    return LlmModelDto.fromEntity(m);
  }

  async create(dto: CreateLlmModelDto): Promise<LlmModelDto> {
    const provider = await this.prisma.llmProvider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException(`LlmProvider ${dto.providerId} not found`);
    }

    const duplicate = await this.prisma.llmModel.findUnique({
      where: {
        providerId_value: { providerId: dto.providerId, value: dto.value },
      },
    });
    if (duplicate) {
      throw new ConflictException(
        `LlmModel with value "${dto.value}" already exists for provider "${provider.name}"`,
      );
    }

    const created = await this.prisma.llmModel.create({ data: dto });
    return LlmModelDto.fromEntity(created);
  }

  async update(id: string, dto: UpdateLlmModelDto): Promise<LlmModelDto> {
    await this.findById(id);
    const updated = await this.prisma.llmModel.update({
      where: { id },
      data: dto,
    });
    this.llmConfig.invalidate();
    return LlmModelDto.fromEntity(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    const inUse = await this.prisma.llmConfig.findFirst({
      where: { modelId: id },
    });
    if (inUse) {
      throw new ConflictException(
        `Cannot delete LlmModel ${id} — it is currently assigned to agent role "${inUse.agentRole}". Reassign the agent role first.`,
      );
    }
    await this.prisma.llmModel.delete({ where: { id } });
    this.llmConfig.invalidate();
  }
}
