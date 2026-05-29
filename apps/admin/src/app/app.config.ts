import {
  type ApplicationConfig,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { FORGE_ENV } from '@forge/auth';
import { provideForgeFirebase } from '@forge/data-access';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura } }),
    { provide: FORGE_ENV, useValue: environment },
    provideForgeFirebase({
      firebase: environment.firebase,
      appCheckSiteKey: environment.appCheckSiteKey,
      useEmulators: !environment.production,
    }),
  ],
};
