import { Injectable, NotFoundException } from '@nestjs/common';
import { IncidentLinkStatus } from '../../common/enums';
import { PrismaService } from '../../prisma/prisma.service';

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

  listForIncident(incidentId: string) {
    return this.prisma.incidentLink.findMany({
      where: { OR: [{ fromId: incidentId }, { toId: incidentId }] },
      orderBy: { similarity: 'desc' },
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
