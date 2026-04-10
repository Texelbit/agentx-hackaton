import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { IncidentStatus } from '@prisma/client';
import { ExtractedIncident } from '../chat/interfaces/extracted-incident.interface';
import { IIncidentFromChatCreator } from '../chat/interfaces/incident-from-chat-creator.interface';
import { AuditAction, AuditActorType, NotificationEvent, Role } from '../common/enums';
import { EnvConfig } from '../config/env.config';
import { GitHubService } from '../integrations/github/github.service';
import { JiraService } from '../integrations/jira/jira.service';
import { PrioritiesService } from '../priorities/priorities.service';
import { PrismaService } from '../prisma/prisma.service';
import { IndexerService } from '../rag/indexer.service';
import { RagService } from '../rag/rag.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SREAgent } from './agents/sre.agent';
import { IncidentDto, UpdateIncidentDto } from './dto/incident.dto';
import {
  IIncidentNotifier,
  INCIDENT_NOTIFIER,
} from './interfaces/incident-notifier.interface';
import {
  IRealtimeBroadcaster,
  REALTIME_BROADCASTER,
} from './interfaces/realtime-broadcaster.interface';
import { TriageOutput } from './interfaces/triage-output.interface';
import {
  IncidentWithRelations,
  IncidentsRepository,
} from './repositories/incidents.repository';
import {
  AUDIT_RECORDER,
  IAuditRecorder,
} from '../audit/interfaces/audit-recorder.interface';
import { StorageService } from '../storage/storage.service';
import { BranchNamingService } from './services/branch-naming.service';
import { IncidentLinksService } from './services/incident-links.service';

/**
 * The heart of the SRE Agent. Owns the full pipeline from a finalized chat
 * intake all the way to a Jira ticket + GitHub branch + indexed embedding +
 * realtime broadcast + notification dispatch.
 *
 * Implements `IIncidentFromChatCreator` so the Chat module's controller can
 * create incidents without depending on the Incidents module directly.
 */
@Injectable()
export class IncidentsService implements IIncidentFromChatCreator {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly repo: IncidentsRepository,
    private readonly prisma: PrismaService,
    private readonly priorities: PrioritiesService,
    private readonly sreAgent: SREAgent,
    private readonly rag: RagService,
    private readonly indexer: IndexerService,
    private readonly jira: JiraService,
    private readonly github: GitHubService,
    private readonly branchNaming: BranchNamingService,
    private readonly systemConfig: SystemConfigService,
    private readonly links: IncidentLinksService,
    private readonly env: EnvConfig,
    private readonly storage: StorageService,
    @Optional()
    @Inject(AUDIT_RECORDER)
    private readonly audit?: IAuditRecorder,
    @Optional()
    @Inject(INCIDENT_NOTIFIER)
    private readonly notifier?: IIncidentNotifier,
    @Optional()
    @Inject(REALTIME_BROADCASTER)
    private readonly realtime?: IRealtimeBroadcaster,
  ) {}

  // ── Read API ─────────────────────────────────────────────────────────

  async findAll(): Promise<IncidentDto[]> {
    const list = await this.repo.findAll();
    return list.map(IncidentDto.fromEntity);
  }

  async findMine(reporterId: string): Promise<IncidentDto[]> {
    const list = await this.repo.findByReporter(reporterId);
    return list.map(IncidentDto.fromEntity);
  }

  async findOne(
    id: string,
    actorId: string,
    actorRole: Role,
  ): Promise<IncidentDto> {
    const incident = await this.requireIncident(id);

    if (
      actorRole === Role.REPORTER &&
      incident.reporterId !== actorId
    ) {
      throw new ForbiddenException('You can only view your own incidents');
    }

    return IncidentDto.fromEntity(incident);
  }

  async update(
    id: string,
    dto: UpdateIncidentDto,
  ): Promise<IncidentDto> {
    const before = await this.requireIncident(id);

    const updated = await this.repo.update(id, {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.resolutionNotes !== undefined
        ? { resolutionNotes: dto.resolutionNotes }
        : {}),
      ...(dto.status === IncidentStatus.DONE
        ? { resolvedAt: new Date() }
        : {}),
    });

    if (dto.status && dto.status !== before.status) {
      this.afterStatusChange(updated, dto.status).catch((err) =>
        this.logger.error(`afterStatusChange failed: ${(err as Error).message}`),
      );
    }

    return IncidentDto.fromEntity(updated);
  }

  // ── Similar incidents ───────────────────────────────────────────────

  async listSimilar(incidentId: string) {
    return this.links.listForIncident(incidentId);
  }

  // ── IIncidentFromChatCreator ─────────────────────────────────────────

  async createFromChat(args: {
    chatSessionId: string;
    reporterId: string;
    reporterEmail: string;
    extracted: ExtractedIncident;
  }): Promise<{ id: string }> {
    this.logger.log(`Creating incident from chat session ${args.chatSessionId}`);

    // 1. Resolve the priority hint to a real DB row (fallback to MEDIUM)
    const priority = await this.resolvePriority(
      args.extracted.suggestedPriorityName ?? 'MEDIUM',
    );

    // 2. Create the bare incident in BACKLOG so we have an ID for embedding
    const created = await this.repo.create({
      title: args.extracted.title,
      description: args.extracted.description,
      service: args.extracted.service,
      reporterEmail: args.reporterEmail,
      status: IncidentStatus.BACKLOG,
      priority: { connect: { id: priority.id } },
      reporter: { connect: { id: args.reporterId } },
      chatSession: { connect: { id: args.chatSessionId } },
    });

    // AUDIT: intake finalized
    await this.audit?.record({
      actorType: AuditActorType.SRE_AGENT,
      action: AuditAction.INTAKE_FINALIZED,
      entity: 'Incident',
      entityId: created.id,
      metadata: { title: created.title, service: created.service, priority: priority.name, reporterEmail: args.reporterEmail },
    });

    // 3. Embed + similarity search (run after persisting so the new incident
    //    is excluded from its own neighbors). The candidates list is hoisted
    //    so the Jira-comment step below can use it without re-querying.
    const queryText = `${created.title}\n${created.description}`;
    let similarCandidates: { incidentId: string; similarity: number }[] = [];
    try {
      await this.rag.embedIncident(created.id, queryText);
      const threshold = await this.systemConfig.getSimilarityThreshold();
      similarCandidates = await this.rag.searchSimilarIncidents(
        queryText,
        threshold,
        5,
        created.id,
      );
      if (similarCandidates.length > 0) {
        await this.links.createSuggestions(created.id, similarCandidates);
        this.realtime?.emit('incident.link_suggested', {
          incidentId: created.id,
          candidates: similarCandidates,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Embedding/similarity step failed: ${(err as Error).message}`,
      );
    }

    // 4. Triage with the SREAgent
    let triage: TriageOutput | null = null;
    try {
      triage = await this.sreAgent.run({
        title: created.title,
        description: created.description,
        service: created.service,
        reproductionSteps: args.extracted.reproductionSteps,
        errorOutput: args.extracted.errorOutput,
      });
    } catch (err) {
      this.logger.error(
        `SREAgent triage failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    // 5. Persist triage summary + reconfirm priority from agent verdict
    const triageSummary = triage ? this.formatTriage(triage) : null;
    let triagePriorityId = priority.id;
    if (triage?.assignedPriorityName) {
      try {
        const triagePriority = await this.resolvePriority(
          triage.assignedPriorityName,
        );
        triagePriorityId = triagePriority.id;
      } catch {
        this.logger.warn(
          `Triage priority ${triage.assignedPriorityName} not found, keeping ${priority.name}`,
        );
      }
    }

    let withTriage = await this.repo.update(created.id, {
      triageSummary,
      priority: { connect: { id: triagePriorityId } },
    });

    // AUDIT: triage completed
    if (triage) {
      await this.audit?.record({
        actorType: AuditActorType.SRE_AGENT,
        action: AuditAction.TRIAGE_COMPLETED,
        entity: 'Incident',
        entityId: created.id,
        metadata: {
          rootCause: triage.rootCause,
          assignedPriority: triage.assignedPriorityName,
          affectedComponents: triage.affectedComponents,
        },
      });
    }

    // 6. Create Jira ticket
    try {
      const issue = await this.jira.createTicket({
        title: withTriage.title,
        description: this.buildJiraDescription(withTriage, triage),
      });
      withTriage = await this.repo.update(withTriage.id, {
        jiraTicketKey: issue.key,
        jiraTicketUrl: `${this.envBaseUrl()}/browse/${issue.key}`,
      });

      // AUDIT: Jira ticket created
      await this.audit?.record({
        actorType: AuditActorType.SRE_AGENT,
        action: AuditAction.JIRA_TICKET_CREATED,
        entity: 'Incident',
        entityId: created.id,
        metadata: { jiraKey: issue.key, jiraUrl: `${this.envBaseUrl()}/browse/${issue.key}` },
      });
    } catch (err) {
      this.logger.error(
        `Jira ticket creation failed: ${(err as Error).message}`,
      );
    }

    // 6b. If we found similar incidents AND the Jira ticket exists, post a
    //     comment listing them so engineers see the historical context
    //     directly inside Jira (not only in the dashboard).
    if (similarCandidates.length > 0 && withTriage.jiraTicketKey) {
      try {
        const commentBody = await this.buildSimilarIncidentsComment(
          similarCandidates,
        );
        await this.jira.addComment(withTriage.jiraTicketKey, commentBody);
        this.logger.log(
          `Posted similar-incidents comment to ${withTriage.jiraTicketKey}`,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to post similar-incidents comment to Jira: ${(err as Error).message}`,
        );
      }
    }

    // 7. Create GitHub branch (only if Jira succeeded — branch naming needs the key)
    if (withTriage.jiraTicketKey) {
      try {
        const baseBranch = await this.systemConfig.getDefaultBaseBranch();
        const branchName = await this.branchNaming.build({
          ticketKey: withTriage.jiraTicketKey,
          title: withTriage.title,
        });
        await this.github.createBranch(branchName, baseBranch);
        withTriage = await this.repo.update(withTriage.id, {
          githubBranch: branchName,
        });

        // AUDIT: GitHub branch created
        await this.audit?.record({
          actorType: AuditActorType.SRE_AGENT,
          action: AuditAction.GITHUB_BRANCH_CREATED,
          entity: 'Incident',
          entityId: created.id,
          metadata: { branch: branchName, baseBranch },
        });
      } catch (err) {
        this.logger.error(
          `GitHub branch creation failed: ${(err as Error).message}`,
        );
      }
    }

    // 8. Upload attachments to GCS + save to DB + attach to Jira
    if (args.extracted.attachments?.length) {
      for (const att of args.extracted.attachments) {
        try {
          // Upload to GCS
          let url: string | null = null;
          if (this.storage.isConfigured) {
            url = await this.storage.uploadBase64({
              base64: att.data,
              mimeType: att.mimeType,
              folder: `incidents/${withTriage.id}`,
            });
          }

          // Save to DB
          const ext = att.mimeType.split('/')[1] ?? 'bin';
          await this.prisma.incidentAttachment.create({
            data: {
              incidentId: withTriage.id,
              url: url ?? `data:${att.mimeType};base64,${att.data.slice(0, 50)}...`,
              mimeType: att.mimeType,
              uploadedBy: args.reporterEmail,
            },
          });

          // Attach to Jira ticket
          if (withTriage.jiraTicketKey) {
            try {
              await this.jira.addAttachment(withTriage.jiraTicketKey, {
                buffer: Buffer.from(att.data, 'base64'),
                filename: `attachment-${Date.now()}.${ext}`,
                mimeType: att.mimeType,
              });
            } catch (jiraErr) {
              this.logger.warn(
                `Jira attachment failed for ${withTriage.jiraTicketKey}: ${(jiraErr as Error).message}`,
              );
            }
          }
        } catch (err) {
          this.logger.warn(
            `Attachment upload failed: ${(err as Error).message}`,
          );
        }
      }
      this.logger.log(
        `Processed ${args.extracted.attachments.length} attachments for incident ${withTriage.id}`,
      );
    }

    // 9. Realtime broadcast + notification dispatch (best-effort)
    this.realtime?.emit('incident.created', {
      id: withTriage.id,
      title: withTriage.title,
      status: withTriage.status,
    });

    if (this.notifier) {
      this.notifier
        .dispatch({
          incidentId: withTriage.id,
          event: NotificationEvent.INCIDENT_CREATED,
        })
        .then(() => {
          // AUDIT: notification sent
          void this.audit?.record({
            actorType: AuditActorType.SRE_AGENT,
            action: AuditAction.NOTIFICATION_SENT,
            entity: 'Incident',
            entityId: created.id,
            metadata: { event: NotificationEvent.INCIDENT_CREATED, channels: ['email', 'slack'] },
          });
        })
        .catch((err) =>
          this.logger.error(
            `Notification dispatch failed: ${(err as Error).message}`,
          ),
        );
    }

    return { id: withTriage.id };
  }

  // ── Status change side-effects (called by webhooks too) ──────────────

  async applyStatusChange(
    incidentId: string,
    newStatus: IncidentStatus,
  ): Promise<IncidentWithRelations> {
    const updated = await this.repo.setStatus(incidentId, newStatus);
    await this.afterStatusChange(updated, newStatus);
    return updated;
  }

  private async afterStatusChange(
    incident: IncidentWithRelations,
    newStatus: IncidentStatus,
  ): Promise<void> {
    this.realtime?.emit('incident.status_changed', {
      id: incident.id,
      status: newStatus,
    });

    const event = this.mapStatusToEvent(newStatus);
    if (event && this.notifier) {
      await this.notifier.dispatch({
        incidentId: incident.id,
        event,
      });
    }

    // On resolution: re-embed with notes for future RAG retrieval
    if (newStatus === IncidentStatus.DONE) {
      try {
        await this.indexer.indexIncident({
          id: incident.id,
          title: incident.title,
          description: incident.description,
          triageSummary: incident.triageSummary,
          resolutionNotes: incident.resolutionNotes,
        });
      } catch (err) {
        this.logger.warn(
          `Re-indexing resolved incident failed: ${(err as Error).message}`,
        );
      }
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────

  private async requireIncident(id: string): Promise<IncidentWithRelations> {
    const incident = await this.repo.findById(id);
    if (!incident) throw new NotFoundException(`Incident ${id} not found`);
    return incident;
  }

  private async resolvePriority(name: string) {
    // Normalize to UPPER_CASE so "Critical" / "critical" / "CRITICAL" all match.
    const normalized = name.toUpperCase().trim();
    try {
      return await this.priorities.findByName(normalized);
    } catch {
      this.logger.warn(
        `Priority "${name}" (normalized: "${normalized}") not found — falling back to MEDIUM`,
      );
      return this.priorities.findByName('MEDIUM');
    }
  }

  /**
   * Renders a plain-text comment listing similar past incidents for the
   * Jira ticket. Uses the similarity score returned by pgvector + the
   * peer incident's title, status and Jira key (joined per row).
   *
   * Output is plain text (not markdown) because Jira's ADF wrapper in
   * `JiraService.toAdf` only supports paragraphs — bullet lists would
   * need a richer ADF builder, which we keep for a future iteration.
   */
  private async buildSimilarIncidentsComment(
    candidates: { incidentId: string; similarity: number }[],
  ): Promise<string> {
    const incidents = await Promise.all(
      candidates.map((c) =>
        this.repo.findById(c.incidentId).then((i) => ({ candidate: c, incident: i })),
      ),
    );

    const lines: string[] = [
      `🔍 SRE Agent found ${candidates.length} similar past incident(s) reported previously:`,
      '',
    ];

    for (const { candidate, incident } of incidents) {
      if (!incident) continue;
      const similarityPct = (candidate.similarity * 100).toFixed(0);
      const jiraRef = incident.jiraTicketKey
        ? `${incident.jiraTicketKey}`
        : '(no Jira link)';
      lines.push(
        `• [${similarityPct}% match] ${jiraRef} — "${incident.title}" (status: ${incident.status})`,
      );
    }

    lines.push('');
    lines.push(
      'Review these from the SRE Agent dashboard to confirm or reject the link.',
    );

    return lines.join('\n');
  }

  private formatTriage(t: TriageOutput): string {
    return [
      `## Root cause`,
      t.rootCause || '_(none)_',
      ``,
      `## Affected components`,
      t.affectedComponents.map((c) => `- ${c}`).join('\n') || '_(none)_',
      ``,
      `## Investigation steps`,
      t.investigationSteps.map((s, i) => `${i + 1}. ${s}`).join('\n') || '_(none)_',
      ``,
      `## Files to check`,
      t.filesToCheck.map((f) => `- ${f}`).join('\n') || '_(none)_',
      ``,
      `## Recurrence pattern`,
      t.recurrencePattern || '_(none detected)_',
      ``,
      `## Assigned priority`,
      t.assignedPriorityName,
    ].join('\n');
  }

  private buildJiraDescription(
    incident: IncidentWithRelations,
    triage: TriageOutput | null,
  ): string {
    return [
      `Reported by: ${incident.reporterEmail}`,
      `Service: ${incident.service}`,
      ``,
      incident.description,
      ``,
      triage ? this.formatTriage(triage) : '_(triage failed — manual review needed)_',
    ].join('\n');
  }

  private mapStatusToEvent(status: IncidentStatus): NotificationEvent | null {
    switch (status) {
      case IncidentStatus.IN_PROGRESS:
        return NotificationEvent.STATUS_IN_PROGRESS;
      case IncidentStatus.IN_REVIEW:
        return NotificationEvent.STATUS_IN_REVIEW;
      case IncidentStatus.READY_TO_TEST:
        return NotificationEvent.STATUS_READY_TO_TEST;
      case IncidentStatus.DONE:
        return NotificationEvent.STATUS_DONE;
      default:
        return null;
    }
  }

  private envBaseUrl(): string {
    return this.env.jiraBaseUrl.replace(/\/$/, '');
  }
}
