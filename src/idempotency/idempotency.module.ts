import { Module } from '@nestjs/common';
import { PrismaIdempotencyStoreService } from './storage/prisma-idempotency-store.service';
import { IDEMPOTENCY_STORE } from './storage/idempotency-store.interface';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  providers: [
    PrismaIdempotencyStoreService,
    { provide: IDEMPOTENCY_STORE, useExisting: PrismaIdempotencyStoreService },
    IdempotencyInterceptor,
  ],
  exports: [IDEMPOTENCY_STORE, IdempotencyInterceptor],
})
export class IdempotencyModule {}
