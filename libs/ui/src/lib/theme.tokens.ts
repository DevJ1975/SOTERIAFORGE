/**
 * White-label design tokens for the Soteria FORGE design system.
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
 */
export const DEFAULT_THEME: ThemeTokens = {
  colorPrimary: '#1d4ed8',
  colorSurface: '#ffffff',
  colorAccent: '#7c3aed',
  colorText: '#111827',
  colorTextMuted: '#6b7280',
  fontFamily: "'Inter', system-ui, sans-serif",
  radius: '0.375rem',
};

/**
 * Converts a `ThemeTokens` object into a flat map of `--forge-*` CSS custom property names
 * to their values.
 *
 * @example
 * tokensToCssVars(DEFAULT_THEME)
 * // => { '--forge-color-primary': '#1d4ed8', '--forge-color-surface': '#ffffff', ... }
 */
export function tokensToCssVars(tokens: ThemeTokens): Record<string, string> {
  const result: Record<string, string> = {};

  const camelToKebab = (key: string): string =>
    key.replace(/([A-Z])/g, (match) => `-${match.toLowerCase()}`);

  for (const [key, value] of Object.entries(tokens)) {
    if (value === undefined || value === null) continue;
    const cssVarName = `--forge-${camelToKebab(key)}`;
    result[cssVarName] = String(value);
  }

  return result;
}
