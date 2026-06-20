import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Messaging, deleteToken, getToken, isSupported } from '@angular/fire/messaging';
import { ASSURANCE_ENV } from '@assurance/auth';

/**
 * Outcome of an opt-in attempt. The UI uses this to show a tasteful message
 * (enabled / blocked / not-supported) instead of relying on thrown errors.
 */
export type EnableRemindersResult =
  | 'enabled'
  | 'permission-denied'
  | 'unsupported'
  | 'not-configured'
  | 'error';

interface RegisterTokenInput {
  token: string;
  remove?: boolean;
}

/**
 * Learner-side push opt-in for streak/assignment reminders (MO-11).
 *
 * SSR-safe and best-effort: every path guards `window`/`navigator`/`Notification`
 * and FCM availability so it cannot throw or break the build/PWA when messaging,
 * the VAPID key, or a browser are absent. {@link enableReminders} MUST be called
 * from an explicit user gesture (e.g. an "Enable reminders" button) — never on
 * load — because it triggers the browser permission prompt.
 *
 * On success it retrieves the FCM token (via `@angular/fire/messaging`'s
 * `getToken` with the env VAPID key) and registers it through the existing
 * `registerFcmToken` callable so the backend can target this device.
 *
 * Live delivery additionally requires the `fcmVapidKey` to be set, a
 * `firebase-messaging-sw.js` service worker served at the origin, and a real
 * device/browser that supports the Push API — none of which exist in CI, so only
 * the guarded branching below is unit-tested (with mocks).
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly env = inject(ASSURANCE_ENV);
  private readonly fns = inject(Functions, { optional: true });
  private readonly messaging = inject(Messaging, { optional: true });

  /** True only when push opt-in can actually proceed in this context. */
  async canEnable(): Promise<boolean> {
    if (!this.isBrowser) return false;
    if (typeof Notification === 'undefined') return false;
    if (!this.env.fcmVapidKey || !this.messaging || !this.fns) return false;
    try {
      return await isSupported();
    } catch {
      return false;
    }
  }

  /**
   * Request notification permission, fetch the FCM token, and register it with
   * the backend. Returns a result describing the outcome; never throws.
   */
  async enableReminders(): Promise<EnableRemindersResult> {
    if (!(await this.canEnable())) return 'not-configured';

    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      return 'error';
    }
    if (permission !== 'granted') return 'permission-denied';

    try {
      const token = await getToken(this.messaging as Messaging, {
        vapidKey: this.env.fcmVapidKey,
      });
      if (!token) return 'error';
      await this.callRegister({ token });
      return 'enabled';
    } catch {
      return 'error';
    }
  }

  /**
   * Opt out: delete the local FCM token and remove it from the member doc so the
   * backend stops targeting this device. Best-effort; never throws.
   */
  async disableReminders(): Promise<void> {
    if (!this.isBrowser || !this.messaging || !this.fns) return;
    try {
      const token = await getToken(this.messaging as Messaging, {
        vapidKey: this.env.fcmVapidKey,
      }).catch(() => undefined);
      if (token) {
        await this.callRegister({ token, remove: true }).catch(() => undefined);
      }
      await deleteToken(this.messaging as Messaging).catch(() => undefined);
    } catch {
      // best-effort opt-out
    }
  }

  private callRegister(input: RegisterTokenInput): Promise<unknown> {
    const fns = this.fns;
    if (!fns) return Promise.resolve();
    const call = httpsCallable<RegisterTokenInput, { ok: boolean }>(fns, 'registerFcmToken');
    return call(input);
  }
}
