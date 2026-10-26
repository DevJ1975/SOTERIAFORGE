import { inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Branding } from '@assurance/shared';
import { DEFAULT_THEME, ThemeTokens, pickSfTokenOverrides, tokensToCssVars } from './theme.tokens';

/**
 * ThemeService manages the active white-label theme for the current tenant.
 *
 * It writes CSS custom properties onto `document.documentElement.style` at runtime
 * so that all downstream PrimeNG + custom SCSS picks up tenant branding without a
 * page reload. In SSR mode the injected DOCUMENT token refers to the server-side DOM.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  /** `--sf-*` properties written by applySfOverrides, so reset() can remove them. */
  private readonly sfOverrideKeys = new Set<string>();

  /** The currently active design tokens (reactive signal). */
  readonly tokens = signal<ThemeTokens>({ ...DEFAULT_THEME });

  /**
   * Applies a full set of design tokens by writing `--assurance-*` CSS custom properties
   * onto the document root element.
   */
  applyTheme(tokens: ThemeTokens): void {
    this.tokens.set(tokens);
    const cssVars = tokensToCssVars(tokens);
    const root = this.document.documentElement;
    for (const [prop, value] of Object.entries(cssVars)) {
      root.style.setProperty(prop, value);
    }
  }

  /**
   * Maps a `Branding` object (from `@assurance/shared`) onto `ThemeTokens` and applies them.
   * Fields that are absent in the branding fall back to the current token values.
   */
  applyBranding(branding: Branding): void {
    const current = this.tokens();
    const merged: ThemeTokens = {
      ...current,
      fontFamily: branding.fontFamily ?? current.fontFamily,
      logoUrl: branding.logoUrl ?? current.logoUrl,
    };

    // Map free-form colors record onto known token keys where the keys match
    // --assurance-* property names (e.g. { '--assurance-color-primary': '#...' }).
    if (branding.colors) {
      const colorPrimary = branding.colors['--assurance-color-primary'];
      if (colorPrimary) merged.colorPrimary = colorPrimary;

      const colorSurface = branding.colors['--assurance-color-surface'];
      if (colorSurface) merged.colorSurface = colorSurface;

      const colorAccent = branding.colors['--assurance-color-accent'];
      if (colorAccent) merged.colorAccent = colorAccent;

      const colorText = branding.colors['--assurance-color-text'];
      if (colorText) merged.colorText = colorText;

      const colorTextMuted = branding.colors['--assurance-color-text-muted'];
      if (colorTextMuted) merged.colorTextMuted = colorTextMuted;

      const radius = branding.colors['--assurance-radius'];
      if (radius) merged.radius = radius;
    }

    this.applyTheme(merged);
    this.applySfOverrides(pickSfTokenOverrides(branding.colors));
  }

  /**
   * Writes tenant overrides of Soteria Forge kit tokens (`--sf-*`) onto the
   * document root. The Forge PrimeNG preset and `sf-*` classes read these
   * properties, so the whole UI re-skins without a rebuild.
   */
  applySfOverrides(overrides: Record<string, string>): void {
    const root = this.document.documentElement;
    for (const [prop, value] of Object.entries(pickSfTokenOverrides(overrides))) {
      root.style.setProperty(prop, value);
      this.sfOverrideKeys.add(prop);
    }
  }

  /** Resets the theme back to the built-in defaults. */
  reset(): void {
    const root = this.document.documentElement;
    for (const prop of this.sfOverrideKeys) root.style.removeProperty(prop);
    this.sfOverrideKeys.clear();
    this.applyTheme({ ...DEFAULT_THEME });
  }
}
