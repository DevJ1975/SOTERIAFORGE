import { type EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { TenantService } from '@forge/auth';
import { TenantRepository } from '@forge/data-access';
import { ThemeService } from '@forge/ui';

/**
 * Runtime white-labeling: on app start, resolve the active tenant (subdomain),
 * load its branding from Firestore, and apply it via the design-system
 * ThemeService (CSS custom properties). Falls back to the default theme on any
 * failure so the app always renders.
 *
 * For the SSR storefront this runs server-side too, so the correct theme is in
 * the initial HTML.
 */
export function provideTenantTheme(): EnvironmentProviders {
  return provideAppInitializer(async () => {
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
