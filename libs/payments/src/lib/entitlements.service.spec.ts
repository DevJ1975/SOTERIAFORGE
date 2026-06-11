import { TestBed } from '@angular/core/testing';
import type { B2cCustomer } from '@forge/shared';
import { ForgeEntitlements, ownsProduct } from './entitlements.service';

function customerWith(entitlements: string[]): B2cCustomer {
  return {
    uid: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    entitlements,
    purchaseHistory: [],
  };
}

describe('ownsProduct', () => {
  it('is true when the product id is in the entitlements', () => {
    expect(ownsProduct(customerWith(['p1', 'p2']), 'p2')).toBe(true);
  });

  it('is false when the product id is missing', () => {
    expect(ownsProduct(customerWith(['p1']), 'p2')).toBe(false);
  });

  it('is false for a null or undefined customer', () => {
    expect(ownsProduct(null, 'p1')).toBe(false);
    expect(ownsProduct(undefined, 'p1')).toBe(false);
  });

  it('is false for an empty entitlement list', () => {
    expect(ownsProduct(customerWith([]), 'p1')).toBe(false);
  });
});

describe('ForgeEntitlements', () => {
  // No Firebase providers: Firestore/Auth resolve to null, so the service
  // settles as 'ready' with no customer instead of opening a snapshot.
  let service: ForgeEntitlements;

  beforeEach(() => {
    service = TestBed.inject(ForgeEntitlements);
  });

  it('settles as ready with no customer when Firestore is unavailable', () => {
    expect(service.status()).toBe('ready');
    expect(service.customer()).toBeNull();
    expect(service.entitlementIds()).toEqual([]);
    expect(service.owns('p1')).toBe(false);
  });

  it('owns() and entitlementIds track the customer signal', () => {
    service.customer.set(customerWith(['p1']));

    expect(service.entitlementIds()).toEqual(['p1']);
    expect(service.owns('p1')).toBe(true);
    expect(service.owns('p2')).toBe(false);

    service.customer.set(null);
    expect(service.owns('p1')).toBe(false);
  });

  it('refreshClaims resolves even without an authenticated user', async () => {
    // PrincipalStore.refreshClaims() no-ops when Auth is unavailable.
    await expect(service.refreshClaims()).resolves.toBeUndefined();
  });
});
