import { Injectable } from '@nestjs/common';
import { Incident, IncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const INCIDENT_INCLUDE = {
  priority: true,
  reporter: { select: { id: true, email: true, fullName: true } },
  attachments: true,
} as const;

export type IncidentWithRelations = Prisma.IncidentGetPayload<{
  include: typeof INCIDENT_INCLUDE;
}>;

@Injectable()
export class IncidentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<IncidentWithRelations[]> {
    return this.prisma.incident.findMany({
      include: INCIDENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByReporter(reporterId: string): Promise<IncidentWithRelations[]> {
    return this.prisma.incident.findMany({
      where: { reporterId },
      include: INCIDENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<IncidentWithRelations | null> {
    return this.prisma.incident.findUnique({
      where: { id },
      include: INCIDENT_INCLUDE,
    });
  }

  findByJiraKey(jiraKey: string): Promise<IncidentWithRelations | null> {
    return this.prisma.incident.findFirst({
      where: { jiraTicketKey: jiraKey },
      include: INCIDENT_INCLUDE,
    });
  }

  findByBranch(branch: string): Promise<IncidentWithRelations | null> {
    return this.prisma.incident.findFirst({
      where: { githubBranch: branch },
      include: INCIDENT_INCLUDE,
    });
  }

  create(data: Prisma.IncidentCreateInput): Promise<Incident> {
    return this.prisma.incident.create({ data });
  }

  update(
    id: string,
    data: Prisma.IncidentUpdateInput,
  ): Promise<IncidentWithRelations> {
    return this.prisma.incident.update({
      where: { id },
      data,
      include: INCIDENT_INCLUDE,
    });
  }

  setStatus(
    id: string,
    status: IncidentStatus,
  ): Promise<IncidentWithRelations> {
    return this.prisma.incident.update({
      where: { id },
      data: {
        status,
        ...(status === IncidentStatus.DONE ? { resolvedAt: new Date() } : {}),
      },
      include: INCIDENT_INCLUDE,
    });
  }
}
