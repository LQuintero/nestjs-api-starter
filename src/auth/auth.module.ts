import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions, type JwtSignOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaTokenStorageService } from './storage/prisma-token-storage.service';
import { TOKEN_STORAGE } from './storage/token-storage.interface';

// Global so the exported JwtAuthGuard instance (built here with access to
// UsersService and JwtService) can be applied via @UseGuards in other modules
// without each one re-importing JwtModule/UsersModule.
@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('auth.jwtAccessSecret'),
        signOptions: {
          // The configured TTL is validated upstream; cast to the jsonwebtoken
          // duration type which is a template-literal string at the type level.
          expiresIn: (config.get<string>('auth.jwtAccessTtl') ??
            '15m') as NonNullable<JwtSignOptions['expiresIn']>,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PrismaTokenStorageService,
    { provide: TOKEN_STORAGE, useExisting: PrismaTokenStorageService },
    JwtAuthGuard,
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
