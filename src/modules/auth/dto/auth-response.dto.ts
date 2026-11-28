import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthResponseDto {
  @ApiProperty({
    description: 'Send as "Authorization: Bearer <token>"',
    example:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzMjU1NjkzMy01OTMxLTQ1MGItYmRmMi03MjFjZWEwYjk3NDQiLCJlbWFpbCI6ImxpbmFAZXhhbXBsZS5jb20iLCJyb2xlIjoiVklFV0VSIn0.4k9xQm3v7bN2pTz8sLw1yR6uHc5dFa0eJi7oKq2XgYs',
  })
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({
    description: 'Access token lifetime in seconds',
    example: 900,
  })
  expiresIn!: number;

  @ApiProperty({
    description: 'Single use: each refresh returns a new one',
    example: 'm5JeJS48jwAIYLCbODxNXYs1Qq7vT2nR9kLp3sWd8Hc',
  })
  refreshToken!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
