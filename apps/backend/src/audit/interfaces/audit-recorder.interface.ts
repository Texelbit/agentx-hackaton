import { AuditAction, AuditActorType } from '../../common/enums';

/**
 * IoC bridge to the Audit module (Block 10). Any module that needs to record
 * an audit log entry depends on this interface — never on `AuditService`
 * directly — so the bridge can be wired late and stay optional.
 */
export const AUDIT_RECORDER = 'AUDIT_RECORDER';

export interface AuditRecord {
  actorType: AuditActorType;
  actorId?: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface IAuditRecorder {
  record(entry: AuditRecord): Promise<void>;
}
