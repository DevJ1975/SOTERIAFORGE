# Brand Restyle — Build Contracts (authoritative)

Full-fidelity restyle to the "Forged Shield" Soteria Forge handoff. The brand is already ~90% applied
(token-first, layered Spectrum + brand). This pass closes gaps + applies the handoff's component
language across all 4 apps + adds a net-new Certificate of Completion. **No product rename.** Game art
(PERIL! blue/gold, Hazard Hunter world/HUD) is intentional — do NOT touch `libs/games`. Branch:
`claude/nice-heisenberg-90bs5f` (even with `main`); new draft PR.

Authoritative values (from the handoff `soteria-forge-brand.css`):
```
--sf-ember #E8551F  --sf-ember-hot #FF7A3D  --sf-spark #FFB552  --sf-charcoal #1B1E23
--sf-ink #1A1D22  --sf-steel #3A4048  --sf-cast #F6F1E9  --sf-surface #F6F5F6
--sf-page #E9E8EA  --sf-hairline #DDDCDE  --sf-muted #8A929C   header #15171B
--sf-grad-ember linear-gradient(150deg,#F69A3C,#D8451A)
--sf-grad-flame linear-gradient(180deg,#FFE6B0,#F8D38A)
radius: tile 24 / card 18 / chip 12     fonts: Oswald 700 (display), Barlow Semi Condensed 600 (ui)
wordmark: SOTERIA(--sf-ink) FORGE(--sf-ember) | reversed on dark: #F4F2EE / --sf-ember-hot
tagline: SAFETY · COMPLIANCE · TRAINING (Barlow 600, 0.32em, uppercase, --sf-muted)
```
Most `--sf-*` already exist in `libs/ui/src/lib/theme/spectrum.scss` (correct values). The 3 SVGs are
already extracted to `libs/ui/src/assets/brand/{soteria-forge-mark,soteria-forge-mark-mono,
soteria-forge-lockup-horizontal}.svg` (served at `/brand/*.svg` via the existing project.json assets glob).

## Constraint (must hold)
Design tokens only in brand UI — never hardcode hex (game art excepted). All overridable values stay
`--forge-*`/`--sf-*` so `ForgeTheming.applyBranding` (libs/auth) and the ATL navy/teal tenant still
override at runtime. Default brand is the base. Prettier (single quotes/width 100/trailing commas);
standalone Angular 20 + OnPush + signals; nx boundaries.

## Lanes (no cross-lane edits; no git; orchestrator owns package.json/.github)

### R1 — Theme tokens + PrimeNG preset (libs/ui/src/lib/theme/**)
- `spectrum.scss`: add `--sf-grad-flame`; add radius scale `--forge-radius-tile:24px`,
  `--forge-radius-card:18px`, `--forge-radius-chip:12px` (keep `--forge-radius` as alias of card 18 +
  `--forge-radius-small` 4 legacy); retune `.forge-card` → `var(--forge-radius-card)` + `1px solid
  var(--sf-hairline)` + `var(--forge-surface)`; `.forge-page` warm `var(--sf-page)`; `.forge-tagline`
  per handoff (Barlow 600, ~0.72rem, 0.32em, uppercase, `--sf-muted`); add `::selection { background:
  var(--sf-ember); color:#fff }`; focus-ring offset 2px. Ensure `--sf-grad-ember/flame` usable as
  `background`.
- `forge-preset.ts`: PrimeNG `components.card.borderRadius` → 18px, `components.button.borderRadius` →
  12px, `focusRing` offset → 2px. Keep ember primary ramp + charcoal/steel surface ramp.
- Self-check: `nx lint ui`, `nx test ui`, `nx build learner --configuration=production` (preset
  compiles + cascades).

### R2 — Brand assets/components + shell + favicons/manifests
- `libs/ui/src/lib/brand/forge-mark.ts`: render the crisp **SVG** mark (`/brand/soteria-forge-mark.svg`)
  for the full-color variant; for `mono` use `/brand/soteria-forge-mark-mono.svg` (inline or `<img>`)
  honoring `currentColor` (charcoal/white via `color`); keep PNG srcset as fallback. Add standalone
  `ForgeLockup` (mark + SOTERIA/FORGE wordmark, reuse the split) and `ForgeTagline` components; export
  all from `libs/ui/src/index.ts`.
- `libs/ui/src/lib/shell/shell.ts`: replace the 3 hardcoded hex — `.brand-name #f4f2ee` →
  `var(--sf-cast)` (cream on dark), `.shell-nav a #c4c9cf` → `var(--forge-text-subtle)`, `:hover
  #2a2e35` → `var(--sf-steel)`. Keep the SOTERIA/FORGE split + `--sf-header`. Optionally render
  `<forge-tagline>` under the wordmark on wide widths.
- `apps/*/src/index.html` (all 4): `theme-color` → `#15171b`.
- Add `apps/{admin,superadmin,storefront}/public/manifest.webmanifest` mirroring
  `apps/learner/public/manifest.webmanifest` (per-app name/short_name; icons from `/brand/app-icons`;
  `theme_color #15171b`, `background_color #1b1e23`) and link them in each index.html. Verify each
  app's project.json includes a `public` assets input (learner does — replicate if missing).
- Self-check: `nx lint ui`, `nx test ui`, `nx build admin/superadmin/storefront/learner
  --configuration=production` (SVG + manifests copied to dist/.../browser). firebase.json untouched.

### R3 — Certificate of Completion + learner restyle polish (apps/learner/src/app/**)
- New `features/certificate/certificate-page.ts` (route `certificate/:courseId`, `authGuard`, lazy):
  print-styled HTML (NO new dep; browser print→PDF). **Mono mark on `var(--sf-cast)` ground**, Oswald
  700 `CERTIFICATE OF COMPLETION`, learner `displayName`, course title, completion date, tenant name;
  `@media print` for a clean single page (hide app chrome, fixed size); a "Download / Print" button
  (`window.print()`). Read the completed enrollment + course + member via `@forge/data-access`
  helpers + `PrincipalStore` (mirror `features/my-learning`). Use `ForgeMark` (mono) +
  `--forge-font-display`. Guard: only render when the enrollment is `completed`.
- Add a "View certificate" CTA from the player completion panel (`features/player/player.ts`) and from
  completed courses in `features/my-learning/my-learning.ts`; add the route in `app.routes.ts`.
- Polish `home.ts`: keep the game-art tile gradients (intentional); ensure the live-sessions card +
  sections use `var(--forge-radius-card)` + cast/surface tokens. Quick token sweep of apps/learner
  brand UI (exclude game-art gradients).
- Self-check: `nx lint learner`, `nx test learner`, `nx build learner --configuration=production`.

## Cross-lane notes
R1 defines token NAMES that R2/R3 reference in CSS (runtime resolution — not a compile dependency), so
the lanes run in parallel. R2 edits `apps/*/src/index.html` + non-learner `public/manifest`; R3 edits
`apps/learner/src/app/**` — disjoint files even within apps/learner. Orchestrator runs the full
lint/test/build + a tenant-override regression at integration.
