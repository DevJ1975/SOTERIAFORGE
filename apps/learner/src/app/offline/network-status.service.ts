import { Injectable, signal } from '@angular/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';

/**
 * Live online/offline signal backed by `@capacitor/network`.
 *
 * Works identically on web (the plugin proxies the browser's connection state)
 * and native. Exposes a readonly signal so views can render a network-status
 * indicator without manual subscription bookkeeping.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly onlineSignal = signal(true);
  /** True while the device reports an active network connection. */
  readonly online = this.onlineSignal.asReadonly();

  private listener?: PluginListenerHandle;

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      const status = await Network.getStatus();
      this.onlineSignal.set(status.connected);
      this.listener = await Network.addListener('networkStatusChange', (status) => {
        this.onlineSignal.set(status.connected);
      });
    } catch {
      // Plugin unavailable (e.g. SSR/test) — assume online so the app stays usable.
      this.onlineSignal.set(true);
    }
  }

  /** Detach the network listener (used by tests / teardown). */
  async destroy(): Promise<void> {
    await this.listener?.remove();
    this.listener = undefined;
  }
}
