import { Injectable } from '@nestjs/common';
import { SlugUtil } from '../../common/utils/slug.util';
import { SystemConfigService } from '../../system-config/system-config.service';

/**
 * Builds and parses branch names according to the configurable pattern in
 * `system_config.branch_naming_pattern`.
 *
 * Default pattern: `bugfix/{ticketKey}_{slugTitle}_{timestamp}`
 *
 * Variables supported:
 *   {ticketKey}   — Jira issue key (e.g. AGNTX-25)
 *   {slugTitle}   — PascalCase slug derived from the incident title
 *   {timestamp}   — unix epoch in seconds
 *
 * Keeping this in its own service makes it the single place to change naming
 * rules — webhooks and creation share the same builder.
 */
@Injectable()
export class BranchNamingService {
  constructor(private readonly systemConfig: SystemConfigService) {}

  async build(args: { ticketKey: string; title: string }): Promise<string> {
    const pattern = await this.systemConfig.getBranchNamingPattern();
    const slugTitle = SlugUtil.toPascal(args.title);
    const timestamp = Math.floor(Date.now() / 1000).toString();

    return pattern
      .replace('{ticketKey}', args.ticketKey)
      .replace('{slugTitle}', slugTitle)
      .replace('{timestamp}', timestamp);
  }

  /**
   * Extracts a Jira ticket key from a branch name produced by `build()`.
   * Returns `null` if the branch does not look like one we created.
   *
   * Matches the part right after the prefix slash up to the first underscore
   * — e.g. `bugfix/AGNTX-25_Foo_123` → `AGNTX-25`.
   */
  extractTicketKey(branchName: string): string | null {
    const match = branchName.match(/[/]([A-Z][A-Z0-9]+-\d+)_/);
    return match ? match[1] : null;
  }
}
