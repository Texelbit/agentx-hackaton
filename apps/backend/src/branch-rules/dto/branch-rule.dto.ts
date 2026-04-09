import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BranchStateRule } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { GithubEventType, IncidentStatus } from '../../common/enums';

/**
 * Structured shape of `BranchStateRule.condition`. Stored as JSONB so we can
 * extend it later without migrations, but typed here so the API is honest
 * about what the rule engine actually understands.
 */
export class BranchRuleConditionDto {
  @ApiPropertyOptional({
    description:
      'Match only when the GitHub event refers to this base branch (e.g. "main", "develop")',
  })
  @IsOptional()
  @IsString()
  baseBranch?: string;

  @ApiPropertyOptional({
    description:
      'Match only when the PR was merged (true) or closed without merging (false). Only meaningful for PR_CLOSED events.',
  })
  @IsOptional()
  @IsBoolean()
  merged?: boolean;
}

export class BranchRuleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: GithubEventType })
  eventType!: GithubEventType;

  @ApiProperty({ type: BranchRuleConditionDto })
  condition!: BranchRuleConditionDto;

  @ApiProperty({ enum: IncidentStatus })
  targetStatus!: IncidentStatus;

  @ApiProperty({
    nullable: true,
    description:
      'Resolved Jira status id for this rule. Populated by `seed:jira`. Null until then.',
  })
  jiraStatusId!: string | null;

  @ApiProperty({
    description:
      'Lower numbers are evaluated first. Use to disambiguate overlapping rules.',
  })
  priority!: number;

  @ApiProperty()
  active!: boolean;

  static fromEntity(r: BranchStateRule): BranchRuleDto {
    return {
      id: r.id,
      eventType: r.eventType,
      condition: (r.condition ?? {}) as BranchRuleConditionDto,
      targetStatus: r.targetStatus,
      jiraStatusId: r.jiraStatusId,
      priority: r.priority,
      active: r.active,
    };
  }
}

export class CreateBranchRuleDto {
  @ApiProperty({ enum: GithubEventType })
  @IsEnum(GithubEventType)
  eventType!: GithubEventType;

  @ApiPropertyOptional({ type: BranchRuleConditionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchRuleConditionDto)
  condition?: BranchRuleConditionDto;

  @ApiProperty({ enum: IncidentStatus })
  @IsEnum(IncidentStatus)
  targetStatus!: IncidentStatus;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateBranchRuleDto {
  @ApiPropertyOptional({ enum: GithubEventType })
  @IsOptional()
  @IsEnum(GithubEventType)
  eventType?: GithubEventType;

  @ApiPropertyOptional({ type: BranchRuleConditionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BranchRuleConditionDto)
  condition?: BranchRuleConditionDto;

  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  targetStatus?: IncidentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description:
      'Manual override for the Jira status id this rule transitions to. ' +
      'Pass an empty string to clear the link. Bypasses the auto-resolution ' +
      'from `jira_status_mappings`.',
  })
  @IsOptional()
  @IsString()
  jiraStatusId?: string;
}

export class ReorderBranchRulesDto {
  @ApiProperty({
    type: [String],
    description:
      'Ordered list of rule ids. The position in the array becomes the new priority (0-indexed).',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class JiraStatusOptionDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiPropertyOptional({ nullable: true })
  category!: string | null;
}
