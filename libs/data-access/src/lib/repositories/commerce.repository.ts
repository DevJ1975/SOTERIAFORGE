import { Firestore, orderBy, where } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type B2cCustomer, type CatalogProduct, b2cCustomer, catalogProduct } from '@forge/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/** B2C catalog products (top-level `catalog/{productId}`). Public read. */
@Injectable({ providedIn: 'root' })
export class CatalogRepository extends BaseRepository<CatalogProduct> {
  constructor() {
    super(inject(Firestore), FsPaths.catalog(), catalogProduct, 'catalogProduct');
  }

  /** Published products only — for the public storefront (SSR/SEO). */
  listPublished() {
    return this.list(where('published', '==', true), orderBy('title'));
  }

  /** All products incl. drafts — for the superadmin catalog console. */
  listAll() {
    return this.list(orderBy('title'));
  }
}

/** B2C customers (top-level `customers/{uid}`). Self/superadmin read; server write. */
@Injectable({ providedIn: 'root' })
export class B2cCustomerRepository extends BaseRepository<B2cCustomer> {
  constructor() {
    super(inject(Firestore), FsPaths.b2cCustomerCollection(), b2cCustomer, 'b2cCustomer');
  }
}
