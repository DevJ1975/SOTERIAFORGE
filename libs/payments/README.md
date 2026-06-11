# @forge/payments

B2C storefront payments: the Stripe Checkout hand-off and the customer
entitlements view consumed by `apps/storefront`.

- `ForgeCheckout` — `checkout(productId)` calls the `createCheckoutSession`
  Cloud Function (success/cancel URLs built from `location.origin`) and
  redirects the browser to the Stripe-hosted page. State surfaced via the
  `state` signal (`'idle' | 'redirecting' | 'error'`).
- `ForgeEntitlements` — live `onSnapshot` view of
  `/b2c/store/customers/{uid}` with an `owns(productId)` helper and a
  `refreshClaims()` passthrough to `PrincipalStore` (call it on `/thanks`
  after a purchase so the claims mirror is picked up).
- Pure helpers: `buildCheckoutUrls(origin, productId)`,
  `ownsProduct(customer, productId)`.

Run `nx test payments` to execute the unit tests.
