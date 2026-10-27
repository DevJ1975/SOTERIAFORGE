import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import {
  type EnvironmentProviders,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { ASSURANCE_ENV, TenantService, forgeApiUrl } from '@assurance/auth';
import type { Branding } from '@assurance/shared';
import { ThemeService } from '@assurance/ui';
import { firstValueFrom } from 'rxjs';

/**
 * Runtime white-labeling: on app start (browser only), resolve the active
 * tenant (subdomain), load its branding from the Forge API (`/api/tenant/branding`,
 * public so the sign-in page can be themed), and apply it via the design-system
 * ThemeService (CSS custom properties). Falls back to the default theme on any
 * failure so the app always renders.
 *
 * Deliberately browser-only: during SSR/prerender there is no tenant request
 * context, so the server emits the default theme and the browser applies the
 * tenant theme on hydration.
 */
export function provideTenantTheme(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;

    const http = inject(HttpClient);
    const base = inject(ASSURANCE_ENV).apiBaseUrl;
    const theme = inject(ThemeService);
    const tenantId = inject(TenantService).tenantId();
    if (!tenantId || !base) return;
    try {
      // Sent explicitly: not every app registers the Forge API interceptor.
      const tenant = await firstValueFrom(
        http.get<{ branding?: Branding }>(forgeApiUrl(base, '/api/tenant/branding'), {
          headers: { 'X-Forge-Tenant': tenantId },
        }),
      );
      if (tenant.branding && Object.keys(tenant.branding).length > 0) {
        theme.applyBranding(tenant.branding);
      }
    } catch {
      theme.reset();
    }
  });
}
