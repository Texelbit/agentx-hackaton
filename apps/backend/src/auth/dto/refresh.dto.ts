import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Opaque refresh token (UUID v4)' })
  @IsString()
  @IsUUID('4')
  refreshToken!: string;
}
