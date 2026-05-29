# ADR 0001 — Phase 0 foundational decisions

- **Status:** Accepted
- **Date:** 2026-05-29
- **Deciders:** Jay (product owner), platform architect

## Context

Soteria FORGE is a dual B2B/B2C multi-tenant LMS. Section 16 of the build spec
lists eight open decision points. Four of them gate Phase 0 (monorepo layout,
design system, auth shell, tenant resolution) and were resolved before
scaffolding. The remaining four are deferred to the phases that depend on them.

## Decisions

### 1. Multi-tenancy & identity → GCIP true multi-tenancy

Each tenant is a first-class Google Cloud Identity Platform tenant, giving hard
isolation at the auth layer. Chosen over app-level `tenantId`-claim tenancy
because of the compliance-sensitive (GovCon / SOC 2 / FedRAMP-adjacent) client
profile. `AuthService` binds `auth.tenantId` to the tenant's GCIP id before
sign-in; superadmin authenticates against the project-level pool.

### 2. UI library → PrimeNG

Richer out-of-box widgets accelerate the admin/authoring consoles. Wrapped by a
thin `@forge/ui` design system so per-tenant white-labeling (CSS custom
properties) is centralized regardless of the underlying toolkit.

### 3. App layout → four separate apps

`learner` (PWA), `admin`, `superadmin`, and `storefront` (SSR) are independent
Nx applications, plus the `functions` backend. Maximizes blast-radius isolation
and keeps the storefront's SSR/SEO footprint clean, at the cost of more
scaffolding/CI surface.

### 4. Tenant routing → subdomain

`acme.soteriaforge.com` resolves to tenant `acme`; the apex (and `www`) resolves
to the B2C storefront. Custom domains are a Phase 1+ addition (mapping table in
`ForgeEnvironment.customDomains`). Resolution is a pure function in
`@forge/shared` so it runs identically in browser, SSR, and Cloud Functions.

## Deferred decisions (carry spec defaults; revisit in-phase)

| #   | Decision       | Default carried                                              | Phase |
| --- | -------------- | ------------------------------------------------------------ | ----- |
| 5   | LRS            | Firestore-backed LRS v1 (swappable behind `ingestStatement`) | 3     |
| 6   | Vector store   | Firestore native vector search (`findNearest`)               | 6     |
| 7   | LLM provider   | Vertex AI Gemini, behind a swappable provider interface      | 6     |
| 8   | Video platform | Mux (recommended), with external-link fallback               | 2     |

## Consequences

- Auth code is GCIP-shaped from day one; migrating away later would be costly
  (acceptable — GCIP is the long-term answer).
- Subdomain routing requires wildcard DNS + Vercel wildcard domains in deploy.
- Four apps mean four Vercel projects and more CI matrix entries; mitigated by
  Nx `affected` builds.
