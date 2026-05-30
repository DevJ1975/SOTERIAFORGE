# Accessibility (WCAG 2.1 AA)

Accessibility is treated as a compliance-grade requirement.

## In the codebase

- **Skip link** to `<main id="main-content">` and semantic landmarks
  (`<header>`, `<main>`, `<nav aria-label>`).
- Single `<h1>` per page; logical heading order.
- Form controls have associated `<label>`s; required fields use `aria-required`;
  errors use `aria-live="polite"`.
- Interactive controls have discernible accessible names; icon-only controls use
  `aria-label`. PrimeNG components are configured for keyboard operability.
- Visible focus styles; full keyboard navigation; no keyboard traps.
- Color tokens (per-tenant theming) must meet 4.5:1 contrast — validated per
  tenant brand (a brand-time check).
- Video supports captions; the player exposes standard media controls.

## Automated testing

- **jest-axe** runs `axe-core` against component fixtures in CI (core learner
  flows + design-system components). `toHaveNoViolations()` gates merges.
- **Playwright** e2e (deployment/CI with browsers) runs `@axe-core/playwright`
  against running pages for full-page audits.

## Manual audit (deployment-time)

Required before launch on the core learner flows (sign-in → dashboard → course →
player → quiz → results):

- [ ] Keyboard-only walkthrough of each flow.
- [ ] Screen-reader pass (NVDA/VoiceOver) — names, roles, states announced.
- [ ] Contrast check across default + a sample tenant theme.
- [ ] Reflow at 320px / 400% zoom; no loss of content/function.
- [ ] Captions present on sample video content.
- [ ] Reduced-motion respected for animations (Rive/Phaser).

## Status

- ✅ Semantic shell + form labeling + automated jest-axe gate on core components
- ⏳ Full manual SR/keyboard audit + per-tenant contrast validation
  (deployment-time, against running environments)
