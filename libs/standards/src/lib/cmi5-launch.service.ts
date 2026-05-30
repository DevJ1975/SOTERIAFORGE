import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

/** cmi5 launch parameters returned by the `launchCmi5` function. */
export interface Cmi5LaunchParams {
  auUrl: string;
  endpoint: string;
  fetch: string;
  actor: unknown;
  registration: string;
  activityId: string;
}

/**
 * Requests cmi5 launch parameters for an external AU (e.g. a Unity WebGL build).
 * The server issues a short-lived, tenant-scoped fetch token; the AU exchanges
 * it (via the `fetch` URL) for an auth token and reports xAPI to `endpoint`.
 */
@Injectable({ providedIn: 'root' })
export class Cmi5LaunchService {
  private readonly fns = inject(Functions, { optional: true });

  async launch(activityId: string, auUrl: string): Promise<Cmi5LaunchParams | null> {
    if (!this.fns) return null;
    try {
      const call = httpsCallable<{ activityId: string; auUrl: string }, Cmi5LaunchParams>(
        this.fns,
        'launchCmi5',
      );
      const res = await call({ activityId, auUrl });
      return res.data;
    } catch {
      return null;
    }
  }
}
