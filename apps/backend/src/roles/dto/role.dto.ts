import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';
import { Role } from '../../common/enums';

export class RoleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: Role })
  name!: Role;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'Full permission list to apply (replaces existing set)',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions!: string[];
}
