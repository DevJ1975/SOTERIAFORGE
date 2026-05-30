import { type ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { ASSURANCE_ENV } from '@assurance/auth';
import { provideForgeFirebase } from '@assurance/data-access';
import { provideObservability } from '@assurance/ui';
import { provideForgeTransloco } from '@assurance/ui';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideTenantTheme } from '@assurance/tenant';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideObservability(),
    provideHttpClient(withFetch()),
    provideForgeTransloco(),
    provideAnimationsAsync(),
    providePrimeNG({ theme: { preset: Aura } }),
    { provide: ASSURANCE_ENV, useValue: environment },
    provideForgeFirebase({
      firebase: environment.firebase,
      appCheckSiteKey: environment.appCheckSiteKey,
      useEmulators: !environment.production,
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideTenantTheme(),
  ],
};
