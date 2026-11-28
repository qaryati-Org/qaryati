import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { apiErrorExample } from './api-error-example';
import { AuthenticatedUser } from './authenticated-user';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Create an account (always role VIEWER)' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse(
    apiErrorExample(
      'Invalid email, password length or blank display name',
      '/api/v1/auth/register',
      'VALIDATION_ERROR',
      'Request validation failed',
      [
        { field: 'email', messages: ['email must be an email'] },
        {
          field: 'password',
          messages: ['password must be longer than or equal to 12 characters'],
        },
        { field: 'displayName', messages: ['displayName must not be blank'] },
      ],
    ),
  )
  @ApiConflictResponse(
    apiErrorExample(
      'Email already registered',
      '/api/v1/auth/register',
      'CONFLICT',
      'A user with this email already exists',
    ),
  )
  @ApiTooManyRequestsResponse(
    apiErrorExample(
      'Too many attempts from this IP (default 5 per minute)',
      '/api/v1/auth/register',
      'TOO_MANY_REQUESTS',
      'ThrottlerException: Too Many Requests',
    ),
  )
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto);
  }

  // Rate limited per IP so passwords cannot be guessed without limit.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and get an access + refresh token' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse(
    apiErrorExample(
      'Unknown email, wrong password or deactivated account (same answer)',
      '/api/v1/auth/login',
      'UNAUTHORIZED',
      'Invalid email or password',
    ),
  )
  @ApiTooManyRequestsResponse(
    apiErrorExample(
      'Too many attempts from this IP (default 5 per minute)',
      '/api/v1/auth/login',
      'TOO_MANY_REQUESTS',
      'ThrottlerException: Too Many Requests',
    ),
  )
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a refresh token for new tokens',
    description:
      'The refresh token is single use. Reusing an old one revokes every token from that login.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse(
    apiErrorExample(
      'Invalid, expired or reused refresh token',
      '/api/v1/auth/refresh',
      'UNAUTHORIZED',
      'Invalid or expired refresh token',
    ),
  )
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the refresh tokens of this login' })
  @ApiNoContentResponse({ description: 'Logged out (also for unknown tokens)' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'The user the access token belongs to' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse(
    apiErrorExample(
      'Missing, invalid or expired access token',
      '/api/v1/auth/me',
      'UNAUTHORIZED',
      'Invalid or expired access token',
    ),
  )
  async me(
    @CurrentUser() current: AuthenticatedUser | undefined,
  ): Promise<UserResponseDto> {
    const user = current && (await this.users.findById(current.id));
    if (!user) throw new UnauthorizedException('Authentication required');
    return UserResponseDto.from(user);
  }
}
