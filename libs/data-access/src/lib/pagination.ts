import { getDocs, limit as limitConstraint, query, startAfter } from 'firebase/firestore';
import type { Query, QueryDocumentSnapshot } from 'firebase/firestore';

export interface PageOptions<T> {
  /** Maximum number of items to return in this page. Must be a positive integer. */
  limit: number;
  /** Cursor: the `lastSnapshot` of the previous page. Omit for the first page. */
  after?: QueryDocumentSnapshot<T>;
}

export interface Page<T> {
  items: T[];
  /** Cursor for the next page; undefined when the page is empty. */
  lastSnapshot?: QueryDocumentSnapshot<T>;
  /** True when more documents exist beyond this page. */
  hasMore: boolean;
}

/**
 * Pure limit+1 slicing: given the snapshots fetched with `limit + 1`, trims
 * the sentinel document and derives `hasMore` / the next-page cursor.
 */
export function slicePage<T>(docs: QueryDocumentSnapshot<T>[], pageLimit: number): Page<T> {
  const hasMore = docs.length > pageLimit;
  const pageDocs = hasMore ? docs.slice(0, pageLimit) : docs;
  return {
    items: pageDocs.map((snapshot) => snapshot.data()),
    lastSnapshot: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : undefined,
    hasMore,
  };
}

/**
 * Runs `base` as a cursor-paged query. Fetches `opts.limit + 1` documents so
 * `hasMore` is known without a second round trip; pass `lastSnapshot` back as
 * `opts.after` to fetch the next page.
 *
 * `base` must already include the desired `orderBy` clauses (cursors require
 * a stable ordering).
 */
export async function pageQuery<T>(base: Query<T>, opts: PageOptions<T>): Promise<Page<T>> {
  if (!Number.isInteger(opts.limit) || opts.limit < 1) {
    throw new Error(`pageQuery limit must be a positive integer, got ${opts.limit}`);
  }
  const paged = opts.after
    ? query(base, startAfter(opts.after), limitConstraint(opts.limit + 1))
    : query(base, limitConstraint(opts.limit + 1));
  const snapshot = await getDocs(paged);
  return slicePage(snapshot.docs, opts.limit);
}
