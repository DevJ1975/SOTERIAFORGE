import { Injectable, signal } from '@angular/core';

/** The non-standard (but widely supported) install-prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Captures the browser's `beforeinstallprompt` so the app can offer its own
 * "Install app" affordance instead of relying on the hidden browser menu.
 *
 * Note: Chromium-only. iOS Safari does not fire this event — there, the
 * apple-mobile-web-app meta tags + manifest enable "Add to Home Screen" from
 * the Share sheet, so `canInstall` simply stays false and no button is shown.
 * Inside the Capacitor native shell the app is already installed, so the event
 * never fires either.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferred: BeforeInstallPromptEvent | null = null;

  /** True once the browser has offered an install prompt we can replay. */
  readonly canInstall = signal(false);
  /** True when already running as an installed/standalone PWA. */
  readonly installed = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.canInstall.set(false);
      this.installed.set(true);
    });

    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone === true;
    if (standalone) this.installed.set(true);
  }

  /** Show the native install prompt, if one was captured. */
  async install(): Promise<void> {
    const event = this.deferred;
    if (!event) return;
    this.deferred = null;
    this.canInstall.set(false);
    await event.prompt();
    await event.userChoice.catch(() => undefined);
  }
}
