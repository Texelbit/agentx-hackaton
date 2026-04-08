import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IncidentStatus } from '../../common/enums';
import { IncidentWithRelations } from '../repositories/incidents.repository';

export class IncidentDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  title!: string;
  @ApiProperty()
  description!: string;
  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;
  @ApiProperty()
  service!: string;
  @ApiProperty()
  priorityName!: string;
  @ApiProperty()
  reporterEmail!: string;
  @ApiProperty({ nullable: true })
  jiraTicketKey!: string | null;
  @ApiProperty({ nullable: true })
  jiraTicketUrl!: string | null;
  @ApiProperty({ nullable: true })
  githubBranch!: string | null;
  @ApiProperty({ nullable: true })
  triageSummary!: string | null;
  @ApiProperty()
  createdAt!: Date;
  @ApiProperty({ nullable: true })
  resolvedAt!: Date | null;

  static fromEntity(i: IncidentWithRelations): IncidentDto {
    return {
      id: i.id,
      title: i.title,
      description: i.description,
      status: i.status,
      service: i.service,
      priorityName: i.priority.name,
      reporterEmail: i.reporterEmail,
      jiraTicketKey: i.jiraTicketKey,
      jiraTicketUrl: i.jiraTicketUrl,
      githubBranch: i.githubBranch,
      triageSummary: i.triageSummary,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt,
    };
  }
}

export class UpdateIncidentDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

export class IncidentLinkDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  fromId!: string;
  @ApiProperty()
  toId!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty()
  similarity!: number;
}

export class UpdateIncidentLinkDto {
  @ApiProperty({ enum: ['CONFIRMED', 'REJECTED'] })
  @IsEnum(['CONFIRMED', 'REJECTED'] as const)
  status!: 'CONFIRMED' | 'REJECTED';
}
