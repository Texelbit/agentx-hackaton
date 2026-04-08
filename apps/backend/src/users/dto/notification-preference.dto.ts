import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel, NotificationEvent } from '../../common/enums';

export class NotificationPreferenceItemDto {
  @ApiProperty({ enum: NotificationEvent })
  @IsEnum(NotificationEvent)
  event!: NotificationEvent;

  @ApiProperty({ enum: NotificationChannel })
  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}
