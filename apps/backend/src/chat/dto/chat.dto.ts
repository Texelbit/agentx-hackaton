import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ChatAttachmentDto {
  @ApiProperty({ example: 'image/png' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ description: 'Base64-encoded payload (no data URI prefix)' })
  @IsString()
  data!: string;
}

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  content!: string;

  @ApiPropertyOptional({ type: [ChatAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentDto)
  attachments?: ChatAttachmentDto[];
}

export class ChatSessionDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  userId!: string;
  @ApiProperty()
  finalized!: boolean;
  @ApiProperty()
  createdAt!: Date;
}

export class ChatMessageDto {
  @ApiProperty()
  id!: string;
  @ApiProperty()
  role!: string;
  @ApiProperty()
  content!: string;
  @ApiProperty()
  createdAt!: Date;
}

export class FinalizeResponseDto {
  @ApiProperty()
  sessionId!: string;
  @ApiProperty()
  incidentId!: string;
}
