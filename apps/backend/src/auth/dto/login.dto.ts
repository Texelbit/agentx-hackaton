import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@yourdomain.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'change-me-on-first-login' })
  @IsString()
  @MinLength(8)
  password!: string;
}
