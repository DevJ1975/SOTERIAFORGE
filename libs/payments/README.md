# @forge/payments

Stripe client integration + entitlement model for the B2C storefront.

## Security model — READ THIS FIRST

**The client NEVER sets, writes, or trusts its own payment state.**

Entitlements flow exclusively through the server:

1. User initiates checkout → `CheckoutService.startCheckout(productId)` calls the
   `createCheckoutSession` Cloud Function (Firebase Callable), which creates a
   Stripe-hosted session and returns a URL.
2. Browser is redirected to Stripe Checkout.
3. On successful payment, Stripe sends a signed webhook to the server.
4. The webhook Cloud Function verifies the Stripe signature, records the purchase
   in Firestore, and **then** writes the entitlement to the customer document AND
   sets Firebase custom claims on the user's ID token.
5. On the next token refresh the client receives the updated claims, and
   `EntitlementStore.entitlements` reflects the new state.

**Gating must be enforced at two layers:**

- **Route guard** — use `EntitlementStore.canAccess(productId)` or
  `hasEntitlement(claims, productId)` from `@forge/auth`.
- **Content delivery** — Firestore security rules and/or Cloud Function auth
  checks must independently verify the custom claim; the client-side check is
  UI-only convenience.

## Provided

### `entitlements.ts` — Pure helpers

```ts
isEntitled(entitlements: string[], productId: string): boolean
```

Returns `true` if `productId` is in `entitlements` OR the `'all_access'` sentinel is present.

```ts
resolveAccess(product: CatalogProduct, entitlements: string[]): AccessResult
```

Returns `{ allowed: boolean; reason?: string }`.

**Entitlement convention:**

- `'all_access'` in the user's entitlements array → may access **any** product.
- `product.grants.kind === 'all_access'` → user must hold that specific `product.id`.
- `course` / `module` products → user must hold `product.id` in their entitlements.

### `checkout.service.ts` — `CheckoutService`

```ts
startCheckout(productId: string): Promise<void>
openBillingPortal(): Promise<void>
readonly lastError: Signal<string | null>
```

Calls Firebase Callable Functions and redirects via `document.location.assign`.
Errors are captured in `lastError` (never re-thrown).

### `entitlement.store.ts` — `EntitlementStore`

```ts
readonly entitlements: Signal<string[]>
canAccess(productId: string): boolean
canAccessSignal(productId: string): Signal<boolean>
```

Signal-based store derived from `AuthService` custom claims. Read-only.
