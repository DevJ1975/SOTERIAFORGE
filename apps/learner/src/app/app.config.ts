import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { ForgePreset } from '@forge/ui';
import { provideForgeFirebase } from '@forge/auth';
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
    // NOTE: the Arcade's GAME_RESULT_SINK is provided on the lazy /games
    // routes (games.routes.ts), not here — importing the token from
    // '@forge/games' in this file would drag three.js/phaser into the initial
    // bundle and blow the build budget.
  ],
};
