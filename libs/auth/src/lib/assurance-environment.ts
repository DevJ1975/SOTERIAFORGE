import { InjectionToken } from '@angular/core';

/** Firebase web config + platform settings injected per app/environment. */
export interface AssuranceEnvironment {
  production: boolean;
  /** Platform apex used for subdomain tenant resolution, e.g. "soteriaforge.com". */
  rootDomain: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  /** reCAPTCHA Enterprise site key for App Check. */
  appCheckSiteKey?: string;
  /** Map of host -> tenantId for custom domains (Phase 1+). */
  customDomains?: Record<string, string>;
  /** Map of tenantId -> GCIP Identity Platform tenant id. */
  gcipTenantMap?: Record<string, string>;
}

export const ASSURANCE_ENV = new InjectionToken<AssuranceEnvironment>('ASSURANCE_ENV');
