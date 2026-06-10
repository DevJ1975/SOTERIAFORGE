import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { ForgePreset } from '@forge/ui';
import { COURSE_REPOSITORY, LocalStorageCourseRepository } from '@forge/lms-core';
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
    { provide: COURSE_REPOSITORY, useClass: LocalStorageCourseRepository },
  ],
};
