import { ApiProperty } from '@nestjs/swagger';

export class TokenPairDto {
  @ApiProperty({ description: 'Short-lived access token (RS256, 15 minutes)' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque refresh token (UUID v4, 7 days)' })
  refreshToken!: string;
}
