import { isPlatformBrowser } from '@angular/common';
import {
  type EnvironmentProviders,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { TenantService } from '@forge/auth';
import { TenantRepository } from '@forge/data-access';
import { ThemeService } from '@forge/ui';

/**
 * Runtime white-labeling: on app start (browser only), resolve the active
 * tenant (subdomain), load its branding from Firestore, and apply it via the
 * design-system ThemeService (CSS custom properties). Falls back to the default
 * theme on any failure so the app always renders.
 *
 * Deliberately browser-only: during SSR/prerender there is no tenant request
 * context and no live Firebase config, so a Firestore read would fail the
 * render. The server emits the default theme; the browser applies the tenant
 * theme on hydration. (Request-time per-tenant SSR theming is a later
 * enhancement that reads branding from the request host.)
 */
export function provideTenantTheme(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    const tenants = inject(TenantRepository);
    const theme = inject(ThemeService);
    const tenantId = inject(TenantService).tenantId();
    if (!tenantId) return;
    try {
      const tenant = await tenants.getById(tenantId);
      if (tenant?.branding) {
        theme.applyBranding(tenant.branding);
      }
    } catch {
      theme.reset();
    }
  });
}
