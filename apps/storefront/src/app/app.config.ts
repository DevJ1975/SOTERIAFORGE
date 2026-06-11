import {
  ApplicationConfig,
  mergeApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { ForgePreset } from '@forge/ui';
import { provideForgeFirebase } from '@forge/auth';
import { appRoutes } from './app.routes';

/**
 * Providers shared by the browser and server (SSR) bootstraps.
 *
 * Firebase is deliberately NOT in here: the storefront's server render only
 * produces the crawlable marketing shell (hero, headings, skeletons), so the
 * server bootstrap (app.config.server.ts) runs without Firebase entirely.
 * Everything that touches Firebase does so via optional injection
 * (PrincipalStore, ForgeCheckout, ForgeEntitlements, StoreCatalog) and
 * degrades to a signed-out / empty state on the server.
 */
export const sharedAppConfig: ApplicationConfig = {
  providers: [
    provideClientHydration(withEventReplay()),
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideAnimationsAsync(),
    providePrimeNG({
      ripple: true,
      theme: { preset: ForgePreset, options: { darkModeSelector: '.forge-dark' } },
    }),
  ],
};

/**
 * Browser bootstrap config: shared providers + the Firebase suite (Auth,
 * Firestore, Functions, Storage). On localhost provideForgeFirebase wires the
 * emulators behind a `location` check — which never trips on the server,
 * because the server bootstrap omits these providers altogether.
 */
export const appConfig: ApplicationConfig = mergeApplicationConfig(sharedAppConfig, {
  providers: [provideForgeFirebase()],
});
