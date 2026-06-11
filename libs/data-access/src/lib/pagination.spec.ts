import type { Query, QueryDocumentSnapshot } from 'firebase/firestore';
import { pageQuery, slicePage } from './pagination';

jest.mock('firebase/firestore', () => ({
  getDocs: jest.fn(),
  query: jest.fn((base: unknown, ...constraints: unknown[]) => ({ base, constraints })),
  limit: jest.fn((n: number) => ({ type: 'limit', n })),
  startAfter: jest.fn((cursor: unknown) => ({ type: 'startAfter', cursor })),
}));

const { getDocs, limit, query, startAfter } = jest.requireMock('firebase/firestore') as {
  getDocs: jest.Mock;
  limit: jest.Mock;
  query: jest.Mock;
  startAfter: jest.Mock;
};

function fakeSnapshot<T>(value: T): QueryDocumentSnapshot<T> {
  return { data: () => value } as unknown as QueryDocumentSnapshot<T>;
}

describe('slicePage', () => {
  it('trims the limit+1 sentinel doc and reports hasMore', () => {
    const docs = [1, 2, 3, 4].map(fakeSnapshot); // fetched with limit 3 + 1
    const page = slicePage(docs, 3);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.hasMore).toBe(true);
    expect(page.lastSnapshot).toBe(docs[2]);
  });

  it('returns everything with hasMore=false when under the limit', () => {
    const docs = [1, 2].map(fakeSnapshot);
    const page = slicePage(docs, 3);
    expect(page.items).toEqual([1, 2]);
    expect(page.hasMore).toBe(false);
    expect(page.lastSnapshot).toBe(docs[1]);
  });

  it('handles an exactly-full page without a sentinel', () => {
    const docs = [1, 2, 3].map(fakeSnapshot);
    const page = slicePage(docs, 3);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.hasMore).toBe(false);
  });

  it('returns an empty page with no cursor', () => {
    const page = slicePage([], 5);
    expect(page.items).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.lastSnapshot).toBeUndefined();
  });
});

describe('pageQuery', () => {
  const base = { __kind: 'base-query' } as unknown as Query<number>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches limit+1 docs and slices them into a page', async () => {
    const docs = [10, 20, 30].map(fakeSnapshot);
    getDocs.mockResolvedValueOnce({ docs });

    const page = await pageQuery(base, { limit: 2 });

    expect(limit).toHaveBeenCalledWith(3);
    expect(startAfter).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(base, { type: 'limit', n: 3 });
    expect(page.items).toEqual([10, 20]);
    expect(page.hasMore).toBe(true);
    expect(page.lastSnapshot).toBe(docs[1]);
  });

  it('applies the cursor when opts.after is provided', async () => {
    const cursor = fakeSnapshot(99);
    getDocs.mockResolvedValueOnce({ docs: [fakeSnapshot(100)] });

    const page = await pageQuery(base, { limit: 5, after: cursor });

    expect(startAfter).toHaveBeenCalledWith(cursor);
    expect(query).toHaveBeenCalledWith(
      base,
      { type: 'startAfter', cursor },
      { type: 'limit', n: 6 },
    );
    expect(page.items).toEqual([100]);
    expect(page.hasMore).toBe(false);
  });

  it('rejects non-positive or non-integer limits', async () => {
    await expect(pageQuery(base, { limit: 0 })).rejects.toThrow(/positive integer/);
    await expect(pageQuery(base, { limit: 2.5 })).rejects.toThrow(/positive integer/);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
