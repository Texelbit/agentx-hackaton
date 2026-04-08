import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Role } from '../../common/enums';

export class ChangeRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}
