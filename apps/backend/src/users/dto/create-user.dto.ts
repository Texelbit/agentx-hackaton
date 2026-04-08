import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role } from '../../common/enums';

export class CreateUserDto {
  @ApiProperty({ example: 'engineer@yourdomain.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiProperty({
    example: 'temporary-password-1234',
    description: 'Plaintext password — hashed with bcrypt before storage',
  })
  @IsString()
  @MinLength(12)
  password!: string;

  @ApiProperty({ enum: Role, example: Role.ENGINEER })
  @IsEnum(Role)
  role!: Role;
}
