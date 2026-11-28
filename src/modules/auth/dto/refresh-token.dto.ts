import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

// Body of POST /auth/refresh and POST /auth/logout.
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token returned by login or refresh',
    example: 'm5JeJS48jwAIYLCbODxNXYs1Qq7vT2nR9kLp3sWd8Hc',
  })
  @IsString()
  @Length(1, 128)
  refreshToken!: string;
}
