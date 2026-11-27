import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'lina@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Length over complexity rules, as NIST SP 800-63B recommends. The upper
  // bound keeps argon2 hashing cost predictable.
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  password!: string;

  @ApiProperty({ example: 'Lina', maxLength: 100 })
  @IsString()
  @Length(1, 100)
  // UsersService trims the name, so a name of only spaces would be saved as ''.
  @Matches(/\S/, { message: 'displayName must not be blank' })
  displayName!: string;
}
