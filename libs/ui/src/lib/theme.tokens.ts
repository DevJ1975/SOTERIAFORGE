/**
 * White-label design tokens for the Soteria ASSURANCE design system.
 * Applied at runtime as CSS custom properties on the document root.
 */
export interface ThemeTokens {
  /** Primary brand color (e.g. buttons, links, focus rings). */
  colorPrimary: string;
  /** Surface / background color. */
  colorSurface: string;
  /** Accent color for highlights and decorative elements. */
  colorAccent: string;
  /** Primary text color. */
  colorText: string;
  /** Muted / secondary text color. */
  colorTextMuted: string;
  /** Font family stack. */
  fontFamily: string;
  /** Base border-radius for interactive elements. */
  radius: string;
  /** Logo URL (used by PageShellComponent). */
  logoUrl?: string;
}

/**
 * Default theme tokens — used before a tenant theme is applied.
 *
 * Values reference the Soteria Forge kit tokens (`--sf-*`, loaded globally from
 * `libs/ui/src/styles/forge/index.css`), so the legacy `--assurance-*` properties
 * resolve to Forge colours/type until a tenant overrides them.
 */
export const DEFAULT_THEME: ThemeTokens = {
  colorPrimary: 'var(--sf-ember)',
  colorSurface: 'var(--sf-surface)',
  colorAccent: 'var(--sf-flame)',
  colorText: 'var(--sf-ink)',
  colorTextMuted: 'var(--sf-muted)',
  fontFamily: 'var(--sf-font)',
  radius: 'var(--sf-radius-md)',
};

/** A tenant may override any kit token directly, e.g. `{ '--sf-ember': '#0057B8' }`. */
export const SF_TOKEN_PATTERN = /^--sf-[a-z0-9-]+$/;

/** Picks the `--sf-*` kit-token overrides out of a free-form branding colour map. */
export function pickSfTokenOverrides(
  colors: Record<string, string> | undefined | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!colors) return out;
  for (const [key, value] of Object.entries(colors)) {
    if (SF_TOKEN_PATTERN.test(key) && typeof value === 'string' && value.trim()) {
      out[key] = value.trim();
    }
  }
  return out;
}

/**
 * Converts a `ThemeTokens` object into a flat map of `--assurance-*` CSS custom property names
 * to their values.
 *
 * @example
 * tokensToCssVars(DEFAULT_THEME)
 * // => { '--assurance-color-primary': '#1d4ed8', '--assurance-color-surface': '#ffffff', ... }
 */
export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const result: Record<string, string> = {};

  const camelToKebab = (key: string): string =>
    key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);

  for (const [key, value] of Object.entries(tokens)) {
    if (value === undefined || value === null) continue;
    const cssVarName = `--assurance-${camelToKebab(key)}`;
    result[cssVarName] = String(value);
  }

  return result;
}
