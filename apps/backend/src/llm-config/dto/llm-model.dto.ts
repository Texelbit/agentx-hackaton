import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LlmModel } from '@prisma/client';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class LlmModelDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  providerId!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ description: 'API model identifier (e.g. gemini-2.5-flash)' })
  value!: string;
  @ApiProperty()
  active!: boolean;

  static fromEntity(m: LlmModel): LlmModelDto {
    return {
      id: m.id,
      providerId: m.providerId,
      name: m.name,
      value: m.value,
      active: m.active,
    };
  }
}

export class CreateLlmModelDto {
  @ApiProperty()
  @IsUUID('4')
  providerId!: string;

  @ApiProperty({ example: 'Gemini 2.5 Flash' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'gemini-2.5-flash' })
  @IsString()
  @MinLength(2)
  value!: string;
}

export class UpdateLlmModelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  value?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
