# @assurance/ui — Soteria Assurance Design System

A shared Angular component library providing PrimeNG-based UI components with per-tenant white-label theming via CSS custom properties.

## Overview

`libs/ui` is the design-system library for the Soteria Assurance monorepo. It delivers:

- **Design tokens** — a typed `ThemeTokens` interface with a `DEFAULT_THEME` and a `tokensToCssVars` utility.
- **ThemeService** — an Angular service (provided in root) that holds the active theme as a reactive signal and writes `--forge-*` CSS custom properties onto `document.documentElement.style` at runtime.
- **Components** — thin wrappers over PrimeNG primitives (`forge-button`, `forge-card`, `forge-page-shell`) that use signal inputs/outputs and `ChangeDetectionStrategy.OnPush`.

## White-label Theming Approach

### CSS Custom Properties at Runtime

All design tokens are surfaced as CSS custom properties prefixed with `--forge-`:

| Token key        | CSS custom property        | Example value        |
| ---------------- | -------------------------- | -------------------- |
| `colorPrimary`   | `--forge-color-primary`    | `#1d4ed8`            |
| `colorSurface`   | `--forge-color-surface`    | `#ffffff`            |
| `colorAccent`    | `--forge-color-accent`     | `#7c3aed`            |
| `colorText`      | `--forge-color-text`       | `#111827`            |
| `colorTextMuted` | `--forge-color-text-muted` | `#6b7280`            |
| `fontFamily`     | `--forge-font-family`      | `'Inter', system-ui` |
| `radius`         | `--forge-radius`           | `0.375rem`           |
| `logoUrl`        | `--forge-logo-url`         | `https://…/logo.svg` |

`ThemeService.applyTheme(tokens)` iterates all tokens and calls `document.documentElement.style.setProperty(name, value)` — no page reload required.

### Applying a Tenant Theme

```typescript
// In your root component or app initializer:
import { ThemeService } from '@assurance/ui';

@Component({ ... })
export class AppComponent {
  private themeService = inject(ThemeService);

  ngOnInit() {
    // From a Firestore tenant document:
    this.themeService.applyBranding(tenant.branding);
  }
}
```

`applyBranding` accepts the `Branding` type from `@assurance/shared`, merging its `colors` record (keyed by `--forge-*` property names), `fontFamily`, and `logoUrl` onto the current token set.

### SSR Support

Because `ThemeService` injects Angular's `DOCUMENT` token (not the global `document`), the same code runs safely in server-side rendering. On the server, inject the tenant theme early (e.g. in an `APP_INITIALIZER`) so the HTML sent to the client already contains the `style` attribute with tenant-specific properties, preventing a flash of unstyled content.

```typescript
// Example SSR initializer (in server.ts or app.config.server.ts):
{
  provide: APP_INITIALIZER,
  useFactory: (themeService: ThemeService, tenantTheme: TenantTheme) =>
    () => themeService.applyBranding(tenantTheme.branding),
  deps: [ThemeService, TENANT_THEME],
  multi: true,
}
```

## Components

### `<forge-button>`

A thin wrapper over PrimeNG `p-button` with signal inputs.

```html
<forge-button label="Save" severity="primary" [loading]="isSaving()" (clicked)="onSave($event)" />
```

**Inputs:** `label` (string), `severity` (PrimeNG severity union), `disabled` (boolean), `loading` (boolean)
**Outputs:** `clicked` (MouseEvent)

### `<forge-card>`

Wraps PrimeNG `p-card` with a title input and content projection.

```html
<forge-card title="User Profile">
  <p>Profile details go here.</p>
</forge-card>
```

**Inputs:** `title` (string)

### `<forge-page-shell>`

Top-level layout shell with a themed header (showing the tenant logo if `ThemeService.tokens().logoUrl` is set) and a content projection slot.

```html
<forge-page-shell>
  <router-outlet />
</forge-page-shell>
```

The header background uses `var(--forge-color-primary)` and the body uses `var(--forge-color-surface)` — automatically updated when `ThemeService.applyTheme()` is called.

## Development

```bash
# Run tests
npx nx test ui

# Lint
npx nx lint ui
```
