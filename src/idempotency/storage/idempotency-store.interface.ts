export interface IdempotencyIdentity {
  key: string;
  method: string;
  path: string;
  scope: string;
}

export interface ReserveIdempotencyInput extends IdempotencyIdentity {
  requestHash: string;
  ttlSeconds: number;
}

export interface CompleteIdempotencyInput extends IdempotencyIdentity {
  responseStatus: number;
  responseBody: unknown;
  responseHeaders?: Record<string, string> | undefined;
}

/**
 * Outcome of an atomic reservation attempt:
 * - `started`: the caller won the reservation and must run the handler.
 * - `replay`: a completed record with the same request hash exists; replay it.
 * - `in_progress`: a pending record with the same request hash exists; a
 *   concurrent duplicate is still running, so the caller should return 409.
 * - `conflict`: a valid record exists for the same key but a different request
 *   hash, so the key was reused with different parameters; return 409.
 */
export type ReserveResult =
  | { kind: 'started' }
  | { kind: 'in_progress' }
  | { kind: 'conflict' }
  | {
      kind: 'replay';
      responseStatus: number;
      responseBody: unknown;
      responseHeaders?: Record<string, string> | undefined;
    };

export const IDEMPOTENCY_STORE = Symbol('IDEMPOTENCY_STORE');

/**
 * Storage abstraction for idempotency records.
 *
 * Idempotency lookups run on the hot path of every mutating request, so the
 * backing store is intentionally swappable. The contract is reserve/finalize
 * (not a plain get/set): `reserve` must ATOMICALLY claim the key before the
 * handler runs so two concurrent duplicates cannot both execute side effects.
 * The default is a Prisma/Postgres implementation that uses the unique
 * constraint as the atomic gate; the shape maps naturally to a Redis
 * `SET key val NX EX ttl` reservation plus a follow-up finalize write, which is
 * the recommended production upgrade and provides native TTL cleanup. Swapping
 * stores requires no changes to the idempotency interceptor.
 */
export interface IdempotencyStore {
  /** Atomically reserve the key, replay a completed response, or report a conflict. */
  reserve(input: ReserveIdempotencyInput): Promise<ReserveResult>;
  /** Persist the response and mark the reservation completed. */
  complete(input: CompleteIdempotencyInput): Promise<void>;
  /** Best-effort release of a pending reservation so a failed request can be retried. */
  release(input: IdempotencyIdentity): Promise<void>;
}
