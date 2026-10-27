# storefront (public catalog, SSR)

Public, SEO-optimized course catalog with a request-access path. Server-side
rendered with **incremental hydration** + **event replay** for fast, indexable
pages and cheap interactivity.

- **Rendering:** `@angular/ssr` via the `@angular-devkit/build-angular:application`
  builder (`outputMode: server`, Express entry `src/server.ts`). Static routes
  are prerendered; the catalog is SSR'd.
- **Hydration:** `provideClientHydration(withIncrementalHydration(), withEventReplay())`.
- **Access:** no checkout or accounts. "Request access" is a `mailto:` link to
  `contactEmail` (see `src/environments`). The catalog list is a static placeholder
  in `src/app/core/catalog-data.ts` until a public course endpoint exists.
- **Deploy:** Vercel (`vercel.json`, `framework: angular`). The apex + `www`
  resolve to this app; tenant subdomains resolve to the learner/admin apps.

## Run

```bash
nx serve storefront        # dev server with SSR
nx build storefront        # production build (browser + server + prerender)
node dist/apps/storefront/server/server.mjs   # run the SSR server locally
```
