import { SetMetadata } from '@nestjs/common';

export const REQUIRE_IDEMPOTENCY_KEY = 'requireIdempotency';

export const RequireIdempotency = () =>
  SetMetadata(REQUIRE_IDEMPOTENCY_KEY, true);
