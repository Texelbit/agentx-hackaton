import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentLinkStatus, IncidentStatus } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Enriched view of an incident link, joined with the linked incident's
 * basic metadata so the dashboard can render it without N+1 queries.
 *
 * `peerId` is always the OTHER side of the link from `incidentId`'s
 * perspective. The dashboard never needs to know whether the link is
 * stored as `fromId → incidentId` or vice versa.
 */
export interface SimilarIncidentEntry {
  linkId: string;
  status: IncidentLinkStatus;
  similarity: number;
  peerId: string;
  peerTitle: string;
  peerStatus: IncidentStatus;
  peerPriorityName: string;
  peerJiraKey: string | null;
  peerJiraUrl: string | null;
  peerCreatedAt: Date;
}

/**
 * Manages the `incident_links` table — both the SUGGESTED links produced by
 * the similar-incident detection and the CONFIRMED/REJECTED outcome of an
 * engineer reviewing them in the dashboard.
 */
@Injectable()
export class IncidentLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async createSuggestions(
    fromId: string,
    candidates: { incidentId: string; similarity: number }[],
  ): Promise<void> {
    if (candidates.length === 0) return;

    await this.prisma.$transaction(
      candidates.map((c) =>
        this.prisma.incidentLink.upsert({
          where: { fromId_toId: { fromId, toId: c.incidentId } },
          update: { similarity: c.similarity },
          create: {
            fromId,
            toId: c.incidentId,
            similarity: c.similarity,
            status: IncidentLinkStatus.SUGGESTED,
          },
        }),
      ),
    );
  }

  /**
   * Returns every link involving `incidentId` with the linked-to incident's
   * metadata already joined. Single round-trip — no N+1 — because the
   * dashboard renders these inline.
   */
  async listForIncident(incidentId: string): Promise<SimilarIncidentEntry[]> {
    const links = await this.prisma.incidentLink.findMany({
      where: { OR: [{ fromId: incidentId }, { toId: incidentId }] },
      include: {
        from: { include: { priority: true } },
        to: { include: { priority: true } },
      },
      orderBy: { similarity: 'desc' },
    });

    return links.map((link) => {
      // Pick the OTHER side as the "peer"
      const peer = link.fromId === incidentId ? link.to : link.from;
      return {
        linkId: link.id,
        status: link.status,
        similarity: link.similarity,
        peerId: peer.id,
        peerTitle: peer.title,
        peerStatus: peer.status,
        peerPriorityName: peer.priority.name,
        peerJiraKey: peer.jiraTicketKey,
        peerJiraUrl: peer.jiraTicketUrl,
        peerCreatedAt: peer.createdAt,
      };
    });
  }

  async updateStatus(
    linkId: string,
    status: IncidentLinkStatus,
  ): Promise<void> {
    const exists = await this.prisma.incidentLink.findUnique({
      where: { id: linkId },
    });
    if (!exists) throw new NotFoundException(`Incident link ${linkId} not found`);

    await this.prisma.incidentLink.update({
      where: { id: linkId },
      data: { status },
    });
  }
}
