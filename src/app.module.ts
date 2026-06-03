import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import appConfig from './config/app.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import { validateEnv } from './config/env.validation';
import { LoggingModule } from './common/logging/logging.module';
import { ProblemDetailsFilter } from './common/filters/problem-details.filter';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { IdempotencyModule } from './idempotency/idempotency.module';
import { IdempotencyInterceptor } from './idempotency/idempotency.interceptor';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [appConfig, authConfig, databaseConfig],
    }),
    LoggingModule,
    PrismaModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            // @nestjs/throttler v6 expects the TTL in milliseconds.
            ttl: (config.get<number>('app.throttleTtl') ?? 60) * 1000,
            limit: config.get<number>('app.throttleLimit') ?? 100,
          },
        ],
        // Health probes must never be rate limited.
        skipIf: (context) => {
          const request = context
            .switchToHttp()
            .getRequest<{ url?: string }>();
          return (request.url ?? '').startsWith('/health');
        },
      }),
    }),
    AuthModule,
    UsersModule,
    RolesModule,
    IdempotencyModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: ProblemDetailsFilter,
    },
    {
      // Reuse the IdempotencyInterceptor instance exported by IdempotencyModule
      // so the IDEMPOTENCY_STORE binding resolves from that module.
      provide: APP_INTERCEPTOR,
      useExisting: IdempotencyInterceptor,
    },
  ],
})
export class AppModule {}
