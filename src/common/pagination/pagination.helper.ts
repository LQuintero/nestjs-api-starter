export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MIN_LIMIT = 1;
export const MAX_LIMIT = 100;

/**
 * Upper bound for `page` to keep the computed `skip` within a safe integer
 * range and Prisma-friendly. With the max limit of 100, the largest skip is
 * `(MAX_PAGE - 1) * MAX_LIMIT`, which stays well below Number.MAX_SAFE_INTEGER
 * and PostgreSQL's int8 bounds.
 */
export const MAX_PAGE = 1_000_000;

export interface PaginationInput {
  page?: number | undefined;
  limit?: number | undefined;
}

export interface PaginationParams {
  skip: number;
  take: number;
  page: number;
  limit: number;
}

export interface BuildPaginationMetaInput {
  page: number;
  limit: number;
  total: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Normalizes raw pagination query input into safe Prisma-friendly params.
 *
 * Page is clamped to [1, MAX_PAGE] and limit is clamped to [1, 100] so callers
 * cannot request unbounded result sets or produce an unsafe `skip`.
 */
export function getPaginationParams(input: PaginationInput): PaginationParams {
  const page = clamp(
    Math.floor(input.page ?? DEFAULT_PAGE),
    DEFAULT_PAGE,
    MAX_PAGE,
  );
  const limit = clamp(
    Math.floor(input.limit ?? DEFAULT_LIMIT),
    MIN_LIMIT,
    MAX_LIMIT,
  );

  return {
    skip: (page - 1) * limit,
    take: limit,
    page,
    limit,
  };
}

export function buildPaginationMeta({
  page,
  limit,
  total,
}: BuildPaginationMetaInput): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && totalPages > 0,
  };
}

export function toPaginatedResponse<T>(
  data: T[],
  meta: PaginationMeta,
): PaginatedResponse<T> {
  return { data, meta };
}
