# storefront (B2C, SSR)

Public, SEO-optimized B2C marketplace for the dedicated B2C tenant. Server-side
rendered with **incremental hydration** + **event replay** for fast, indexable
pages and cheap interactivity.

- **Rendering:** `@angular/ssr` via the `@angular-devkit/build-angular:application`
  builder (`outputMode: server`, Express entry `src/server.ts`). Static routes
  are prerendered; dynamic catalog/checkout are SSR'd.
- **Hydration:** `provideClientHydration(withIncrementalHydration(), withEventReplay())`.
- **Payments:** `@assurance/payments` `CheckoutService` → Stripe Checkout. Entitlements
  are granted only by the verified Stripe webhook (server-side); the client never
  sets entitlement state.
- **Deploy:** Vercel (`vercel.json`, `framework: angular`). The apex + `www`
  resolve to this app; tenant subdomains resolve to the learner/admin apps.

## Run

```bash
nx serve storefront        # dev server with SSR
nx build storefront        # production build (browser + server + prerender)
node dist/apps/storefront/server/server.mjs   # run the SSR server locally
```

Phase 7 sources the catalog SSR-side from `/b2c/catalog` (for SEO), wires the
Stripe customer portal, and gates purchased content.
