import { Injectable, Logger } from '@nestjs/common';
import { EnvConfig } from '../../config/env.config';
import {
  JiraCreatedIssue,
  JiraStatus,
  JiraTransition,
} from './jira.types';

/**
 * Thin REST client over the Jira Cloud v3 API.
 *
 * Auth: Basic with the user email + API token (per Atlassian docs).
 * Every method throws `Error` with the response body on non-2xx so the
 * caller can surface a meaningful message via `GlobalExceptionFilter`.
 */
@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);
  private readonly authHeader: string;

  constructor(private readonly env: EnvConfig) {
    const credentials = `${env.jiraEmail}:${env.jiraApiToken}`;
    this.authHeader = `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  // ── Discovery (used by jira.seed.ts) ─────────────────────────────────

  async getProjectStatuses(): Promise<JiraStatus[]> {
    const data = await this.request<
      { statuses: JiraStatus[] }[]
    >(`/rest/api/3/project/${this.env.jiraProjectKey}/statuses`);

    // The endpoint returns `[{ name, statuses: [...] }]` per issue type;
    // we flatten and dedupe by status id.
    const dedup = new Map<string, JiraStatus>();
    for (const issueType of data) {
      for (const status of issueType.statuses) {
        dedup.set(status.id, status);
      }
    }
    return Array.from(dedup.values());
  }

  async getIssueTransitions(issueKey: string): Promise<JiraTransition[]> {
    const data = await this.request<{ transitions: JiraTransition[] }>(
      `/rest/api/3/issue/${issueKey}/transitions`,
    );
    return data.transitions;
  }

  async ping(): Promise<void> {
    await this.request(`/rest/api/3/myself`);
  }

  // ── Ticket lifecycle ─────────────────────────────────────────────────

  async createTicket(args: {
    title: string;
    description: string;
    issueTypeName?: string;
  }): Promise<JiraCreatedIssue> {
    const body = {
      fields: {
        project: { key: this.env.jiraProjectKey },
        summary: args.title.slice(0, 250),
        issuetype: { name: args.issueTypeName ?? 'Bug' },
        description: this.toAdf(args.description),
      },
    };

    return this.request<JiraCreatedIssue>(`/rest/api/3/issue`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Posts a plain-text comment on the given issue. Used to surface useful
   * automated context (e.g. "We found 3 similar past incidents") inside the
   * Jira ticket itself, where the assignee will see it without having to
   * jump to the dashboard.
   *
   * Best-effort by convention — callers should wrap in try/catch and not
   * fail the originating action if the comment can't be posted.
   */
  async addComment(issueKey: string, body: string): Promise<void> {
    await this.request(
      `/rest/api/3/issue/${issueKey}/comment`,
      {
        method: 'POST',
        body: JSON.stringify({ body: this.toAdf(body) }),
      },
    );
  }

  /**
   * Low-level: POST a specific transition ID. Use only when you ALREADY know
   * the transition (not the destination status). Most callers should use
   * `transitionToStatus` instead.
   */
  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request(
      `/rest/api/3/issue/${issueKey}/transitions`,
      {
        method: 'POST',
        body: JSON.stringify({ transition: { id: transitionId } }),
      },
      true,
    );
  }

  /**
   * High-level: move an issue to a target STATUS (not a transition).
   *
   * Jira's REST API requires a `transition.id` when moving issues, NOT a
   * status id. The set of valid transitions depends on the issue's CURRENT
   * status (workflow rules), so we can't precompute them at boot — we have
   * to fetch them per-issue and find the one that lands on the target.
   *
   * Throws with a clear message if no valid transition exists, which usually
   * means the workflow doesn't allow that move from the current state (e.g.
   * trying to go from "Done" to "In Progress" when the workflow only goes
   * forward).
   */
  async transitionToStatus(
    issueKey: string,
    targetStatusId: string,
  ): Promise<{ transitionId: string; transitionName: string }> {
    const transitions = await this.getIssueTransitions(issueKey);

    if (transitions.length === 0) {
      throw new Error(
        `Jira issue ${issueKey} has no available transitions (workflow may be locked)`,
      );
    }

    const match = transitions.find((t) => t.to.id === targetStatusId);
    if (!match) {
      const available = transitions
        .map((t) => `${t.name} → ${t.to.name} (status id ${t.to.id})`)
        .join(', ');
      throw new Error(
        `Jira issue ${issueKey} has no transition to status id ${targetStatusId}. ` +
          `Available transitions from current state: ${available || '(none)'}`,
      );
    }

    await this.transitionIssue(issueKey, match.id);

    this.logger.log(
      `Jira ${issueKey} transitioned via "${match.name}" → "${match.to.name}"`,
    );

    return { transitionId: match.id, transitionName: match.name };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async request<T = unknown>(
    path: string,
    init: RequestInit = {},
    expectEmpty = false,
  ): Promise<T> {
    const url = `${this.env.jiraBaseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: this.authHeader,
        ...(init.headers ?? {}),
      },
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Jira ${init.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
      throw new Error(`Jira API error ${res.status}: ${text}`);
    }

    if (expectEmpty || res.status === 204) {
      return undefined as T;
    }

    return (await res.json()) as T;
  }

  /**
   * Wraps a plain string in the minimal Atlassian Document Format envelope
   * required by the v3 issue endpoints.
   */
  private toAdf(text: string): unknown {
    return {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    };
  }
}
