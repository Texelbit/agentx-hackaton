import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { AgentRole, LlmProviderKind } from '../../common/enums';

/**
 * Snapshot of one agent role's current LLM assignment, joined across
 * llm_configs → llm_models → llm_providers. Returned by
 * `GET /config/llm/assignments`.
 */
export class LlmAssignmentDto {
  @ApiProperty({ enum: AgentRole })
  agentRole!: AgentRole;

  @ApiProperty()
  modelId!: string;
  @ApiProperty()
  modelName!: string;
  @ApiProperty()
  modelValue!: string;

  @ApiProperty()
  providerId!: string;
  @ApiProperty()
  providerName!: string;
  @ApiProperty({ enum: LlmProviderKind })
  providerKind!: LlmProviderKind;
}

export class AssignModelDto {
  @ApiProperty({ description: 'UUID of an existing LlmModel' })
  @IsUUID('4')
  modelId!: string;
}
