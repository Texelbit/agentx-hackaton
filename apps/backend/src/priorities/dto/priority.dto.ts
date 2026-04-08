import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Priority } from '@prisma/client';

export class PriorityDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  description!: string;
  @ApiProperty()
  level!: number;
  @ApiProperty()
  color!: string;
  @ApiProperty()
  active!: boolean;

  static fromEntity(p: Priority): PriorityDto {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      level: p.level,
      color: p.color,
      active: p.active,
    };
  }
}

export class CreatePriorityDto {
  @ApiProperty({ example: 'CRITICAL' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  description!: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  level!: number;

  @ApiProperty({ example: '#ff0000' })
  @IsHexColor()
  color!: string;
}

export class UpdatePriorityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(5)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
