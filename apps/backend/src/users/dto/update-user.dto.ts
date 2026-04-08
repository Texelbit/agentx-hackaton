import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane D.' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  fullName?: string;

  @ApiPropertyOptional({ example: 'new-strong-password' })
  @IsOptional()
  @IsString()
  @MinLength(12)
  password?: string;
}
