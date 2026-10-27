import { InjectionToken } from '@angular/core';

/** Build-time settings for the public storefront (no API calls yet). */
export interface StorefrontEnvironment {
  production: boolean;
  /** Platform apex used to build absolute canonical URLs, e.g. "soteriaforge.com". */
  rootDomain: string;
  /** Where "Request access" mailto: links go. */
  contactEmail: string;
}

export const STOREFRONT_ENV = new InjectionToken<StorefrontEnvironment>('STOREFRONT_ENV');
