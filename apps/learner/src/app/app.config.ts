import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { Firestore } from '@angular/fire/firestore';
import { providePrimeNG } from 'primeng/config';
import { ForgePreset } from '@forge/ui';
import { provideForgeFirebase } from '@forge/auth';
import { FIRESTORE } from '@forge/data-access';
import { OFFLINE_VIDEO_PORT } from '@forge/lms-core';
import { appRoutes } from './app.routes';
import { CapacitorOfflineVideoAdapter } from './offline/capacitor-offline-video.adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes),
    provideAnimationsAsync(),
    providePrimeNG({
      ripple: true,
      theme: { preset: ForgePreset, options: { darkModeSelector: '.forge-dark' } },
    }),
    provideForgeFirebase(),
    // Bridge AngularFire's Firestore (which is the modular firebase/firestore
    // instance, already pointed at the emulator on localhost) to the
    // framework-agnostic data-access token consumed by @forge/lms-core.
    { provide: FIRESTORE, useExisting: Firestore },
    // Capacitor-backed offline video port. The lms-core lesson renderer injects
    // this (optionally) to download/resolve uploaded course videos for offline
    // playback in the native app; on web it degrades to online streaming.
    { provide: OFFLINE_VIDEO_PORT, useExisting: CapacitorOfflineVideoAdapter },
    // Angular service worker for the production web PWA (shell prefetch + lazy
    // static assets). It is deliberately NOT enabled inside the Capacitor native
    // shell: a SW would compete with the WebView's own asset loading and the
    // offline-video `convertFileSrc(...)` (capacitor://) flow, which serves files
    // straight off the device filesystem — so we guard with
    // `!Capacitor.isNativePlatform()`. It is also disabled in dev so live-reload
    // and source maps aren't served from a stale cache. The ngsw config has no
    // dataGroup for Firebase backends, so it never intercepts Firestore
    // long-poll/listen or Storage traffic.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !Capacitor.isNativePlatform(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
