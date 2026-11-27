import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../../config/configuration';
import { UsersModule } from '../users/users.module';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('auth.accessSecret', { infer: true }),
        signOptions: {
          expiresIn: config.get('auth.accessTtlSeconds', { infer: true }),
          algorithm: 'HS256',
        },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    // Only used by login and register (via @UseGuards(ThrottlerGuard)), so
    // the rest of the API is not rate limited by this module.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => [
        {
          ttl: config.get('auth.rateLimitTtlSeconds', { infer: true }) * 1000,
          limit: config.get('auth.rateLimit', { infer: true }),
        },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RefreshTokenService,
    AdminBootstrapService,
    // Global guards run in this order: JwtAuthGuard identifies the caller,
    // then RolesGuard checks @Roles(...). Other modules only add @Roles().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
