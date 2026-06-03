import {
  buildPaginationMeta,
  getPaginationParams,
  MAX_PAGE,
  toPaginatedResponse,
} from './pagination.helper';

describe('pagination helpers', () => {
  describe('getPaginationParams', () => {
    it('normalizes page and limit', () => {
      expect(getPaginationParams({ page: 2, limit: 10 })).toEqual({
        skip: 10,
        take: 10,
        page: 2,
        limit: 10,
      });
    });

    it('applies defaults when page and limit are missing', () => {
      expect(getPaginationParams({})).toEqual({
        skip: 0,
        take: 20,
        page: 1,
        limit: 20,
      });
    });

    it('clamps page to at least 1', () => {
      expect(getPaginationParams({ page: 0, limit: 10 })).toEqual({
        skip: 0,
        take: 10,
        page: 1,
        limit: 10,
      });
    });

    it('clamps limit between 1 and 100', () => {
      expect(getPaginationParams({ page: 1, limit: 0 })).toEqual({
        skip: 0,
        take: 1,
        page: 1,
        limit: 1,
      });

      expect(getPaginationParams({ page: 1, limit: 500 })).toEqual({
        skip: 0,
        take: 100,
        page: 1,
        limit: 100,
      });
    });

    it('clamps an excessively large page to MAX_PAGE and keeps skip safe', () => {
      const result = getPaginationParams({
        page: Number.MAX_SAFE_INTEGER,
        limit: 100,
      });

      expect(result).toEqual({
        skip: (MAX_PAGE - 1) * 100,
        take: 100,
        page: MAX_PAGE,
        limit: 100,
      });
      expect(Number.isSafeInteger(result.skip)).toBe(true);
    });

    it('floors decimal page and limit inputs', () => {
      expect(getPaginationParams({ page: 2.9, limit: 10.7 })).toEqual({
        skip: 10,
        take: 10,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('buildPaginationMeta', () => {
    it('builds pagination metadata', () => {
      expect(buildPaginationMeta({ page: 2, limit: 10, total: 25 })).toEqual({
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('reports no next/previous page on a single page', () => {
      expect(buildPaginationMeta({ page: 1, limit: 20, total: 5 })).toEqual({
        page: 1,
        limit: 20,
        total: 5,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('reports zero total pages when there are no records', () => {
      expect(buildPaginationMeta({ page: 1, limit: 20, total: 0 })).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });
  });

  describe('toPaginatedResponse', () => {
    it('wraps data and meta', () => {
      const meta = buildPaginationMeta({ page: 1, limit: 20, total: 2 });
      const data = [{ id: '1' }, { id: '2' }];

      expect(toPaginatedResponse(data, meta)).toEqual({ data, meta });
    });
  });
});
