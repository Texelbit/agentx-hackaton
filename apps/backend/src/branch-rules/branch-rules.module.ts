import { Module } from '@nestjs/common';
import { BranchRulesController } from './branch-rules.controller';
import { BranchRulesService } from './branch-rules.service';

/**
 * `JiraModule` is already `@Global()` so we can inject `JiraService` here
 * without an explicit import.
 */
@Module({
  controllers: [BranchRulesController],
  providers: [BranchRulesService],
  exports: [BranchRulesService],
})
export class BranchRulesModule {}
