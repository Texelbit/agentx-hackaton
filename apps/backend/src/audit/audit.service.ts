import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditRecord,
  IAuditRecorder,
} from './interfaces/audit-recorder.interface';
import { AuditRepository } from './repositories/audit.repository';

/**
 * Single source of truth for audit log writes.
 *
 * Implements `IAuditRecorder` so other modules (incidents, webhooks, users)
 * depend only on the interface — never on this concrete service.
 */
@Injectable()
export class AuditService implements IAuditRecorder {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repo: AuditRepository) {}

  async record(entry: AuditRecord): Promise<void> {
    try {
      // Prisma 5 does NOT accept plain `null` for nullable JSON fields — it
      // requires either `Prisma.JsonNull` (write a JSON null literal) or the
      // field to be omitted. We omit when the caller passes null/undefined,
      // which leaves the column truly NULL at the SQL level.
      await this.repo.create({
        actorType: entry.actorType,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        ...(entry.before != null
          ? { before: entry.before as Prisma.InputJsonValue }
          : {}),
        ...(entry.after != null
          ? { after: entry.after as Prisma.InputJsonValue }
          : {}),
        ...(entry.metadata != null
          ? { metadata: entry.metadata as Prisma.InputJsonValue }
          : {}),
        ...(entry.actorId
          ? { user: { connect: { id: entry.actorId } } }
          : {}),
      });
    } catch (err) {
      // Audit failures must NEVER break the originating action.
      this.logger.error(`Audit write failed: ${(err as Error).message}`);
    }
  }

  list(args: { skip: number; take: number; entity?: string; entityId?: string }) {
    return this.repo.findPaginated(args);
  }

  count(args: { entity?: string; entityId?: string }) {
    return this.repo.count(args);
  }
}
