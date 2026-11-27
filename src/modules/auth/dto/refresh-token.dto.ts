import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

// Body of POST /auth/refresh and POST /auth/logout.
export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token returned by login or refresh' })
  @IsString()
  @Length(1, 128)
  refreshToken!: string;
}
