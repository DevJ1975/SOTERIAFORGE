import { inject, Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { getDoc, getDocs, query, where } from 'firebase/firestore';
import { b2cCatalogCol, b2cCatalogDoc } from '@forge/data-access';
import type { CatalogProduct } from '@forge/shared';

/** Max length of a catalog card description excerpt, ellipsis included. */
export const EXCERPT_MAX_LENGTH = 160;

/**
 * Collapses whitespace and truncates `text` to `max` characters, cutting on a
 * word boundary where possible and appending an ellipsis when truncated.
 * (Local copy of @forge/lms-core's excerptOf — importing the lms-core barrel
 * would drag the lesson renderer into the catalog chunk.)
 */
export function excerptOf(text: string, max = EXCERPT_MAX_LENGTH): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const slice = collapsed.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(' ');
  // Only respect the word boundary when it doesn't eat most of the excerpt.
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}…`;
}

/** Newest-first by updatedAt (falling back to createdAt; ISO strings). */
export function sortByFreshnessDesc(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort((a, b) =>
    (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
  );
}

/**
 * Read-side of the public B2C catalog at /b2c/store/catalog.
 *
 * The collection accessors are plain firebase/firestore refs, so server-side
 * filtering with `where('published', '==', true)` works directly (no
 * client-side filtering needed; the rules allow world reads regardless).
 *
 * Firestore is injected optionally: under SSR the server bootstrap carries no
 * Firebase providers, and these methods degrade to empty results (the catalog
 * page never calls them on the server anyway).
 */
@Injectable({ providedIn: 'root' })
export class StoreCatalog {
  private readonly db = inject(Firestore, { optional: true });

  /** All published products, most recently updated first. */
  async listPublished(): Promise<CatalogProduct[]> {
    if (!this.db) return [];
    const snapshot = await getDocs(query(b2cCatalogCol(this.db), where('published', '==', true)));
    return sortByFreshnessDesc(snapshot.docs.map((docSnapshot) => docSnapshot.data()));
  }

  /**
   * A single product by id, published or not — the library page must resolve
   * owned products even after they are unpublished from the catalog.
   */
  async getProduct(productId: string): Promise<CatalogProduct | undefined> {
    if (!this.db) return undefined;
    const snapshot = await getDoc(b2cCatalogDoc(this.db, productId));
    return snapshot.exists() ? snapshot.data() : undefined;
  }
}
