import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../common/enums';
import { UserWithRole } from '../repositories/users.repository';

/**
 * Public projection of a user. NEVER includes `passwordHash`.
 */
export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isProtected!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromEntity(user: UserWithRole): UserDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role.name,
      permissions: user.role.permissions.map((rp) => rp.permission.name),
      isActive: user.isActive,
      isProtected: user.isProtected,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
