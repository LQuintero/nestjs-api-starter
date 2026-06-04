import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('registers JwtAuthGuard globally so routes fail closed by default', () => {
    const providers =
      (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as unknown[]) ??
      [];

    expect(providers).toEqual(
      expect.arrayContaining([
        {
          provide: APP_GUARD,
          useExisting: JwtAuthGuard,
        },
      ]),
    );
  });
});
