import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePriorityDto,
  PriorityDto,
  UpdatePriorityDto,
} from './dto/priority.dto';

@Injectable()
export class PrioritiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PriorityDto[]> {
    const list = await this.prisma.priority.findMany({
      orderBy: { level: 'asc' },
    });
    return list.map(PriorityDto.fromEntity);
  }

  async findById(id: string): Promise<PriorityDto> {
    const p = await this.prisma.priority.findUnique({ where: { id } });
    if (!p) throw new NotFoundException(`Priority ${id} not found`);
    return PriorityDto.fromEntity(p);
  }

  async findByName(name: string): Promise<PriorityDto> {
    const p = await this.prisma.priority.findUnique({ where: { name } });
    if (!p) throw new NotFoundException(`Priority ${name} not found`);
    return PriorityDto.fromEntity(p);
  }

  async create(dto: CreatePriorityDto): Promise<PriorityDto> {
    const created = await this.prisma.priority.create({ data: dto });
    return PriorityDto.fromEntity(created);
  }

  async update(id: string, dto: UpdatePriorityDto): Promise<PriorityDto> {
    await this.findById(id);
    const updated = await this.prisma.priority.update({
      where: { id },
      data: dto,
    });
    return PriorityDto.fromEntity(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.priority.delete({ where: { id } });
  }
}
