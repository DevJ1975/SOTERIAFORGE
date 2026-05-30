import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { type TenantResolution, resolveTenantFromHost } from '@assurance/shared';
import { FORGE_ENV } from './forge-environment';

/**
 * Resolves the active tenant from the request host (subdomain strategy) and
 * exposes it as a signal. Runs identically in the browser and in SSR (the
 * DOCUMENT's location is populated from the request URL by Angular SSR).
 */
@Injectable({ providedIn: 'root' })
export class TenantService {
  private readonly env = inject(FORGE_ENV);
  private readonly doc = inject(DOCUMENT);

  private readonly _resolution = signal<TenantResolution>(this.resolve());

  readonly resolution = this._resolution.asReadonly();
  readonly tenantId = computed(() => this._resolution().tenantId);
  readonly isB2c = computed(() => this._resolution().isB2c);

  /** GCIP Identity Platform tenant id for the active app tenant, if mapped. */
  readonly gcipTenantId = computed(() => {
    const id = this._resolution().tenantId;
    if (!id) return null;
    return this.env.gcipTenantMap?.[id] ?? null;
  });

  /** Re-resolve (useful after client-side navigation across hosts in dev). */
  refresh(): void {
    this._resolution.set(this.resolve());
  }

  private resolve(): TenantResolution {
    const host = this.doc.location?.host ?? null;
    return resolveTenantFromHost(host, {
      rootDomain: this.env.rootDomain,
      customDomains: this.env.customDomains,
    });
  }
}
