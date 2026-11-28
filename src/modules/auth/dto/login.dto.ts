import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'lina@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // No minimum here: login must not reveal the password rules of an account.
  @ApiProperty({ example: 'a long enough password' })
  @IsString()
  @MaxLength(128)
  password!: string;
}
