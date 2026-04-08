import { Injectable } from '@nestjs/common';
import { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AuditLogCreateInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data });
  }

  findPaginated(args: {
    skip: number;
    take: number;
    entity?: string;
    entityId?: string;
  }): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: {
        ...(args.entity ? { entity: args.entity } : {}),
        ...(args.entityId ? { entityId: args.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: args.skip,
      take: args.take,
    });
  }

  count(args: { entity?: string; entityId?: string }): Promise<number> {
    return this.prisma.auditLog.count({
      where: {
        ...(args.entity ? { entity: args.entity } : {}),
        ...(args.entityId ? { entityId: args.entityId } : {}),
      },
    });
  }
}
