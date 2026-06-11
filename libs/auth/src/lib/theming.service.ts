import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { Branding } from '@forge/shared';

/**
 * Applies per-tenant white-label branding at runtime by writing CSS custom
 * properties onto <html>. Tracks exactly what it set so reset() restores the
 * stock Soteria Forge theme without touching unrelated properties.
 */
@Injectable({ providedIn: 'root' })
export class ForgeTheming {
  private readonly doc = inject(DOCUMENT);
  private readonly appliedProps = new Set<string>();

  /** Tenant logo for shells/headers to consume; null = stock Forge mark. */
  readonly logoUrl = signal<string | null>(null);

  applyBranding(branding: Branding): void {
    const style = this.doc.documentElement.style;
    for (const [key, value] of Object.entries(branding.colors ?? {})) {
      const prop = key.startsWith('--') ? key : `--${key}`;
      style.setProperty(prop, value);
      this.appliedProps.add(prop);
    }
    if (branding.fontFamily) {
      style.setProperty('--forge-font', branding.fontFamily);
      this.appliedProps.add('--forge-font');
    }
    this.logoUrl.set(branding.logoUrl ?? null);
  }

  /** Removes exactly the properties applyBranding() set. */
  reset(): void {
    const style = this.doc.documentElement.style;
    for (const prop of this.appliedProps) {
      style.removeProperty(prop);
    }
    this.appliedProps.clear();
    this.logoUrl.set(null);
  }
}
