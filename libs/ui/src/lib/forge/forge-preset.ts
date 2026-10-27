/*
 * NOTE: this file deliberately imports nothing from PrimeNG. `@primeng/themes`
 * is ESM-only, and the `@assurance/ui` barrel is loaded by every project's Jest
 * run, so apps compose the preset themselves:
 *
 *   import { definePreset } from '@primeng/themes';   // '@primeuix/themes' on PrimeNG ≥ 20
 *   import Aura from '@primeng/themes/aura';
 *   providePrimeNG({
 *     theme: { preset: definePreset(Aura, FORGE_PRIMENG_TOKENS), options: FORGE_PRIMENG_OPTIONS },
 *   });
 */

/** The kit's focus-ring colour (ember at 45%), derived from the token. */
const FOCUS_RING_COLOR = 'color-mix(in srgb, var(--sf-ember) 45%, transparent)';

/**
 * Tint/shade a kit token without introducing new hex values. Used to fill the
 * 11-step palette PrimeNG expects from the kit's handful of ember tokens.
 */
const mix = (token: string, pct: number, toward = '--sf-surface'): string =>
  `color-mix(in srgb, var(${token}) ${pct}%, var(${toward}))`;

/**
 * PrimeNG (Aura) token overrides that map the theme onto the Soteria Forge
 * `--sf-*` CSS custom properties (libs/ui/src/styles/forge/tokens.css).
 *
 * Because every value is a `var(--sf-*)` reference, per-tenant white-labeling
 * only has to override the `--sf-*` properties at runtime (ThemeService) and
 * PrimeNG widgets follow automatically, with no preset rebuild.
 */
export const FORGE_PRIMENG_TOKENS = {
  primitive: {
    borderRadius: {
      none: '0',
      xs: '4px',
      sm: 'var(--sf-radius-sm)',
      md: 'var(--sf-radius-md)',
      lg: 'var(--sf-radius-lg)',
      xl: 'var(--sf-radius-xl)',
    },
  },
  semantic: {
    transitionDuration: 'var(--sf-dur-fast)',
    focusRing: {
      width: '3px',
      style: 'solid',
      color: FOCUS_RING_COLOR,
      offset: '2px',
      shadow: 'none',
    },
    primary: {
      50: 'var(--sf-ember-soft)',
      100: mix('--sf-ember', 15),
      200: mix('--sf-ember', 30),
      300: mix('--sf-ember', 50),
      400: 'var(--sf-flame)',
      500: 'var(--sf-ember)',
      600: mix('--sf-ember', 88, '--sf-ember-dark'),
      700: 'var(--sf-ember-dark)',
      800: 'var(--sf-ember-on-soft)',
      900: mix('--sf-ember-dark', 70, '--sf-charcoal'),
      950: mix('--sf-ember-dark', 45, '--sf-charcoal'),
    },
    formField: {
      paddingX: 'var(--sf-space-4)',
      paddingY: '0.625rem',
      borderRadius: 'var(--sf-radius-md)',
      focusRing: {
        width: '3px',
        style: 'solid',
        color: FOCUS_RING_COLOR,
        offset: '1px',
        shadow: 'none',
      },
    },
    colorScheme: {
      light: {
        surface: {
          0: 'var(--sf-surface)',
          50: 'var(--sf-cream)',
          100: 'var(--sf-muted-bg)',
          200: 'var(--sf-line)',
          300: 'var(--sf-line)',
          400: 'var(--sf-placeholder)',
          500: 'var(--sf-muted)',
          600: 'var(--sf-ink-2)',
          700: 'var(--sf-ink)',
          800: 'var(--sf-charcoal-3)',
          900: 'var(--sf-charcoal-2)',
          950: 'var(--sf-charcoal)',
        },
        primary: {
          color: 'var(--sf-ember)',
          contrastColor: 'var(--sf-surface)',
          hoverColor: mix('--sf-ember', 88, '--sf-ember-dark'),
          activeColor: 'var(--sf-ember-dark)',
        },
        highlight: {
          background: 'var(--sf-ember-soft)',
          focusBackground: mix('--sf-ember', 15),
          color: 'var(--sf-ember-on-soft)',
          focusColor: 'var(--sf-ember-dark)',
        },
        formField: {
          background: 'var(--sf-surface)',
          borderColor: 'var(--sf-line)',
          hoverBorderColor: 'var(--sf-placeholder)',
          focusBorderColor: 'var(--sf-ember)',
          invalidBorderColor: 'var(--sf-danger)',
          color: 'var(--sf-ink)',
          placeholderColor: 'var(--sf-muted)',
        },
        text: {
          color: 'var(--sf-ink)',
          hoverColor: 'var(--sf-charcoal)',
          mutedColor: 'var(--sf-muted)',
          hoverMutedColor: 'var(--sf-ink-2)',
        },
        content: {
          background: 'var(--sf-surface)',
          borderColor: 'var(--sf-line)',
        },
      },
      dark: {
        surface: {
          0: 'var(--sf-surface)',
          50: 'var(--sf-dark-text)',
          100: 'var(--sf-dark-text)',
          200: 'var(--sf-placeholder)',
          300: 'var(--sf-placeholder)',
          400: 'var(--sf-muted)',
          500: 'var(--sf-ink-2)',
          600: 'var(--sf-dark-line)',
          700: 'var(--sf-dark-line)',
          800: 'var(--sf-dark-pane)',
          900: 'var(--sf-dark-bg)',
          950: 'var(--sf-dark-inset)',
        },
        primary: {
          color: 'var(--sf-ember)',
          contrastColor: 'var(--sf-surface)',
          hoverColor: 'var(--sf-flame)',
          activeColor: 'var(--sf-ember-dark)',
        },
      },
    },
  },
  components: {
    button: {
      root: {
        borderRadius: 'var(--sf-radius-md)',
        paddingX: 'var(--sf-space-5)',
        paddingY: '0.6875rem',
        label: { fontWeight: 'var(--sf-weight-semibold)' },
      },
    },
    card: {
      root: {
        borderRadius: 'var(--sf-radius-xl)',
        shadow: 'var(--sf-shadow-card)',
      },
      body: { padding: 'var(--sf-space-6)' },
    },
  },
};

/**
 * PrimeNG theme options for Forge. The dark scheme is scoped to the Engage
 * shell variant (`.sf-shell--dark`) instead of the OS preference, because the
 * learner app is light-by-design and only Engage is dark.
 */
export const FORGE_PRIMENG_OPTIONS = { darkModeSelector: '.sf-shell--dark' } as const;
