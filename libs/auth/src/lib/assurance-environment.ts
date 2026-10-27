import { InjectionToken } from '@angular/core';

/** Platform settings injected per app/environment. */
export interface AssuranceEnvironment {
  production: boolean;
  /** Platform apex used for subdomain tenant resolution, e.g. "soteriaforge.com". */
  rootDomain: string;
  /** Forge API (Django on Railway), e.g. "https://api.soteriaforge.com". */
  apiBaseUrl: string;
  /** Map of host -> tenantId for custom domains (Phase 1+). */
  customDomains?: Record<string, string>;
}

export const ASSURANCE_ENV = new InjectionToken<AssuranceEnvironment>('ASSURANCE_ENV');
