import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class SystemConfigEntryDto {
  @ApiProperty()
  key!: string;
  @ApiProperty()
  value!: string;
  @ApiProperty()
  description!: string;
}

export class UpdateSystemConfigDto {
  @ApiProperty()
  @IsString()
  value!: string;
}
