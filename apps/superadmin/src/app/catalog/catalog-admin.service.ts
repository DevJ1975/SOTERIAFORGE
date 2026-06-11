import { inject, Injectable } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
// Firestore ops come from the root `firebase/firestore` package so their types
// line up with the converter-typed refs from @forge/data-access (which uses
// the same package; @angular/fire re-exports a nested copy with divergent types).
import { deleteDoc, getDocs, setDoc } from 'firebase/firestore';
import { b2cCatalogCol, b2cCatalogDoc } from '@forge/data-access';
import type { CatalogProduct } from '@forge/shared';

/**
 * Thin I/O wrapper around /b2c/store/catalog so pages (and their specs) can
 * depend on a small promise-based surface instead of the Firebase SDK.
 * Every read and write goes through the zod converter on the
 * @forge/data-access refs, so documents are validated at the boundary.
 */
@Injectable({ providedIn: 'root' })
export class CatalogAdminService {
  // Optional so the service constructs in TestBed without Firebase providers;
  // specs stub this class anyway, and list() degrades to an empty catalog.
  private readonly firestore = inject(Firestore, { optional: true });

  /** All catalog documents — drafts included (rules limit this to superadmin). */
  async list(): Promise<CatalogProduct[]> {
    if (!this.firestore) return [];
    const snapshot = await getDocs(b2cCatalogCol(this.firestore));
    return snapshot.docs.map((docSnapshot) => docSnapshot.data());
  }

  /** Create or replace a product; the converter validates before writing. */
  async save(product: CatalogProduct): Promise<void> {
    await setDoc(b2cCatalogDoc(this.requireDb(), product.id), product);
  }

  async delete(productId: string): Promise<void> {
    await deleteDoc(b2cCatalogDoc(this.requireDb(), productId));
  }

  private requireDb(): Firestore {
    if (!this.firestore) {
      throw new Error('Firestore is unavailable — are the Firebase providers configured?');
    }
    return this.firestore;
  }
}
