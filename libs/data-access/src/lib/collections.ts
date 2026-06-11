import { collection, doc } from 'firebase/firestore';
import type { CollectionReference, DocumentReference, Firestore } from 'firebase/firestore';
import {
  b2cCustomer,
  badge,
  catalogProduct,
  course,
  enrollment,
  leaderboard,
  member,
  module as moduleSchema,
  tenant,
} from '@forge/shared';
import type {
  B2cCustomer,
  Badge,
  CatalogProduct,
  Course,
  Enrollment,
  Leaderboard,
  LeaderboardPeriod,
  Member,
  Module,
  Tenant,
} from '@forge/shared';
import { zodConverter } from './converters';

/**
 * Typed collection / document accessors for the Soteria FORGE Firestore layout.
 *
 * Every reference is wired through {@link zodConverter}, so reads are parsed
 * and writes are validated against the @forge/shared schemas.
 *
 * Note on the B2C area: the schema docblocks describe `/b2c/catalog/{productId}`
 * and `/b2c/customers/{uid}`, but those are 3-segment (odd) paths, which
 * Firestore cannot address as documents. The closest valid layout interposes a
 * fixed singleton document (`/b2c/store`):
 *
 *   /b2c/store/catalog/{productId}
 *   /b2c/store/customers/{uid}
 *
 * Keep this aligned with firestore.rules and the Cloud Functions writers.
 */

/** Fixed parent document for the B2C storefront subcollections. */
export const B2C_STORE_DOC_PATH = 'b2c/store';

const tenantConverter = zodConverter(tenant);
const memberConverter = zodConverter(member);
const courseConverter = zodConverter(course);
const moduleConverter = zodConverter(moduleSchema);
const enrollmentConverter = zodConverter(enrollment);
const badgeConverter = zodConverter(badge);
const leaderboardConverter = zodConverter(leaderboard);
const catalogProductConverter = zodConverter(catalogProduct);
const b2cCustomerConverter = zodConverter(b2cCustomer);

/** /tenants */
export function tenantsCol(db: Firestore): CollectionReference<Tenant> {
  return collection(db, 'tenants').withConverter(tenantConverter);
}

/** /tenants/{tenantId} */
export function tenantDoc(db: Firestore, tenantId: string): DocumentReference<Tenant> {
  return doc(tenantsCol(db), tenantId);
}

/** /tenants/{tenantId}/members */
export function membersCol(db: Firestore, tenantId: string): CollectionReference<Member> {
  return collection(db, 'tenants', tenantId, 'members').withConverter(memberConverter);
}

/** /tenants/{tenantId}/members/{uid} */
export function memberDoc(db: Firestore, tenantId: string, uid: string): DocumentReference<Member> {
  return doc(membersCol(db, tenantId), uid);
}

/** /tenants/{tenantId}/courses */
export function coursesCol(db: Firestore, tenantId: string): CollectionReference<Course> {
  return collection(db, 'tenants', tenantId, 'courses').withConverter(courseConverter);
}

/** /tenants/{tenantId}/courses/{courseId} */
export function courseDoc(
  db: Firestore,
  tenantId: string,
  courseId: string,
): DocumentReference<Course> {
  return doc(coursesCol(db, tenantId), courseId);
}

/** /tenants/{tenantId}/courses/{courseId}/modules */
export function modulesCol(
  db: Firestore,
  tenantId: string,
  courseId: string,
): CollectionReference<Module> {
  return collection(db, 'tenants', tenantId, 'courses', courseId, 'modules').withConverter(
    moduleConverter,
  );
}

/** /tenants/{tenantId}/courses/{courseId}/modules/{moduleId} */
export function moduleDoc(
  db: Firestore,
  tenantId: string,
  courseId: string,
  moduleId: string,
): DocumentReference<Module> {
  return doc(modulesCol(db, tenantId, courseId), moduleId);
}

/** /tenants/{tenantId}/courses/{courseId}/enrollments */
export function enrollmentsCol(
  db: Firestore,
  tenantId: string,
  courseId: string,
): CollectionReference<Enrollment> {
  return collection(db, 'tenants', tenantId, 'courses', courseId, 'enrollments').withConverter(
    enrollmentConverter,
  );
}

/** /tenants/{tenantId}/courses/{courseId}/enrollments/{uid} */
export function enrollmentDoc(
  db: Firestore,
  tenantId: string,
  courseId: string,
  uid: string,
): DocumentReference<Enrollment> {
  return doc(enrollmentsCol(db, tenantId, courseId), uid);
}

/** /tenants/{tenantId}/badges */
export function badgesCol(db: Firestore, tenantId: string): CollectionReference<Badge> {
  return collection(db, 'tenants', tenantId, 'badges').withConverter(badgeConverter);
}

/** /tenants/{tenantId}/badges/{badgeId} */
export function badgeDoc(
  db: Firestore,
  tenantId: string,
  badgeId: string,
): DocumentReference<Badge> {
  return doc(badgesCol(db, tenantId), badgeId);
}

/** /tenants/{tenantId}/leaderboard */
export function leaderboardCol(db: Firestore, tenantId: string): CollectionReference<Leaderboard> {
  return collection(db, 'tenants', tenantId, 'leaderboard').withConverter(leaderboardConverter);
}

/** /tenants/{tenantId}/leaderboard/{period} */
export function leaderboardDoc(
  db: Firestore,
  tenantId: string,
  period: LeaderboardPeriod,
): DocumentReference<Leaderboard> {
  return doc(leaderboardCol(db, tenantId), period);
}

/** /b2c/store/catalog — public storefront products. */
export function b2cCatalogCol(db: Firestore): CollectionReference<CatalogProduct> {
  return collection(db, B2C_STORE_DOC_PATH, 'catalog').withConverter(catalogProductConverter);
}

/** /b2c/store/catalog/{productId} */
export function b2cCatalogDoc(db: Firestore, productId: string): DocumentReference<CatalogProduct> {
  return doc(b2cCatalogCol(db), productId);
}

/** /b2c/store/customers — owner-readable customer/entitlement docs. */
export function b2cCustomersCol(db: Firestore): CollectionReference<B2cCustomer> {
  return collection(db, B2C_STORE_DOC_PATH, 'customers').withConverter(b2cCustomerConverter);
}

/** /b2c/store/customers/{uid} */
export function b2cCustomerDoc(db: Firestore, uid: string): DocumentReference<B2cCustomer> {
  return doc(b2cCustomersCol(db), uid);
}
