import { DestroyRef, Injectable, PLATFORM_ID, type Signal, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Signal-based online/offline connectivity state (MO-04).
 *
 * `online` is initialised from `navigator.onLine` and updated on the `window`
 * `online` / `offline` events. SSR-safe: on the server (or any non-browser
 * environment) it assumes **online** and registers no listeners, so dependent
 * UI renders its normal state during prerender.
 *
 * Consumers (e.g. the offline banner, page empty-states) read `online()` /
 * `offline()` reactively.
 *
 * @Injectable({ providedIn: 'root' }) — one shared connectivity source.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _online = signal(true);

  /** True when the browser reports network connectivity (assumed true on SSR). */
  readonly online: Signal<boolean> = this._online.asReadonly();

  constructor() {
    const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
    if (!isBrowser) {
      // Server / non-browser: assume online, no listeners.
      return;
    }

    if (typeof navigator !== 'undefined') {
      this._online.set(navigator.onLine !== false);
    }

    const onOnline = () => this._online.set(true);
    const onOffline = () => this._online.set(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
  }

  /** Convenience inverse of {@link online}. */
  offline(): boolean {
    return !this._online();
  }
}
