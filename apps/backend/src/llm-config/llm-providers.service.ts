import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLlmProviderDto,
  LlmProviderDto,
  UpdateLlmProviderDto,
} from './dto/llm-provider.dto';
import { LlmConfigService } from './llm-config.service';

/**
 * CRUD over `llm_providers`. Toggling `active=false` is a soft-disable that
 * prevents agents from resolving to a model under this provider, but keeps
 * the row around so historical references stay intact.
 */
@Injectable()
export class LlmProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmConfig: LlmConfigService,
  ) {}

  async findAll(): Promise<LlmProviderDto[]> {
    const list = await this.prisma.llmProvider.findMany({
      orderBy: { name: 'asc' },
    });
    return list.map(LlmProviderDto.fromEntity);
  }

  async findById(id: string): Promise<LlmProviderDto> {
    const p = await this.prisma.llmProvider.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`LlmProvider ${id} not found`);
    return LlmProviderDto.fromEntity(p);
  }

  async create(dto: CreateLlmProviderDto): Promise<LlmProviderDto> {
    const existing = await this.prisma.llmProvider.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(
        `LlmProvider with name "${dto.name}" already exists`,
      );
    }
    const created = await this.prisma.llmProvider.create({ data: dto });
    return LlmProviderDto.fromEntity(created);
  }

  async update(
    id: string,
    dto: UpdateLlmProviderDto,
  ): Promise<LlmProviderDto> {
    await this.findById(id);
    const updated = await this.prisma.llmProvider.update({
      where: { id },
      data: dto,
    });
    // Any cached resolution that referenced this provider may now be stale
    this.llmConfig.invalidate();
    return LlmProviderDto.fromEntity(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    // Cascade deletes the provider's models, which would orphan any
    // llm_configs referencing them. Block the delete if any agent role
    // currently uses one of this provider's models.
    const inUse = await this.prisma.llmConfig.findFirst({
      where: { model: { providerId: id } },
    });
    if (inUse) {
      throw new ConflictException(
        `Cannot delete LlmProvider ${id} — it is referenced by an active agent role assignment. Reassign the agent role first.`,
      );
    }
    await this.prisma.llmProvider.delete({ where: { id } });
    this.llmConfig.invalidate();
  }
}
