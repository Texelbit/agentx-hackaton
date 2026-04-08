import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LlmProvider } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { LlmProviderKind } from '../../common/enums';

export class LlmProviderDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ enum: LlmProviderKind })
  kind!: LlmProviderKind;
  @ApiProperty()
  active!: boolean;

  static fromEntity(p: LlmProvider): LlmProviderDto {
    return { id: p.id, name: p.name, kind: p.kind, active: p.active };
  }
}

export class CreateLlmProviderDto {
  @ApiProperty({ example: 'OpenAI Production' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: LlmProviderKind })
  @IsEnum(LlmProviderKind)
  kind!: LlmProviderKind;
}

export class UpdateLlmProviderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ enum: LlmProviderKind })
  @IsOptional()
  @IsEnum(LlmProviderKind)
  kind?: LlmProviderKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
