import { type ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { provideObservability } from '@assurance/ui';
import { provideForgeTransloco } from '@assurance/ui';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { environment } from '../environments/environment';
import { STOREFRONT_ENV } from '../environments/storefront-environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideObservability(),
    provideHttpClient(withFetch()),
    provideForgeTransloco(),
    // SSR + incremental hydration for the public/marketing surfaces.
    provideClientHydration(withIncrementalHydration(), withEventReplay()),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura } }),
    { provide: STOREFRONT_ENV, useValue: environment },
  ],
};
