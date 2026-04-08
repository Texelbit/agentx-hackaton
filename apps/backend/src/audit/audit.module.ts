import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
import { AUDIT_RECORDER } from './interfaces/audit-recorder.interface';
import { AuditRepository } from './repositories/audit.repository';

/**
 * Global so any module can rely on the `AUDIT_RECORDER` token without
 * re-importing this module.
 */
@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditRepository,
    { provide: AUDIT_RECORDER, useExisting: AuditService },
  ],
  exports: [AuditService, AUDIT_RECORDER],
})
export class AuditModule {}
