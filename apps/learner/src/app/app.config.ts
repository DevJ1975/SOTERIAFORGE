import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { Firestore } from '@angular/fire/firestore';
import { providePrimeNG } from 'primeng/config';
import { ForgePreset } from '@forge/ui';
import { provideForgeFirebase } from '@forge/auth';
import { FIRESTORE } from '@forge/data-access';
import { appRoutes } from './app.routes';

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
  ],
};
