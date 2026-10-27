import { type ApplicationConfig, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideServiceWorker } from '@angular/service-worker';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';
import { ASSURANCE_ENV, forgeApiInterceptor, provideForgeApi } from '@assurance/auth';
import { AUTH_BRAND_LOGO } from '@assurance/auth-ui';
import { FORGE_PRIMENG_OPTIONS, FORGE_PRIMENG_TOKENS, provideObservability } from '@assurance/ui';
import { provideForgeTransloco } from '@assurance/ui';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideTenantTheme } from '@assurance/tenant';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(appRoutes, withComponentInputBinding()),
    provideObservability(),
    // Forge API (Django): the interceptor adds the access token + tenant.
    provideHttpClient(withFetch(), withInterceptors([forgeApiInterceptor])),
    provideForgeApi(),
    provideForgeTransloco(),
    provideAnimationsAsync(),
    // Soteria Forge: PrimeNG widgets read the --sf-* kit tokens (libs/ui/src/styles/forge).
    providePrimeNG({
      theme: { preset: definePreset(Aura, FORGE_PRIMENG_TOKENS), options: FORGE_PRIMENG_OPTIONS },
    }),
    { provide: ASSURANCE_ENV, useValue: environment },
    // Forge lockup (kit file, used as-is) above the sign-in card.
    {
      provide: AUTH_BRAND_LOGO,
      useValue: {
        src: 'assets/forge/logo/forge-lockup-horizontal-on-light.svg',
        alt: 'Soteria Forge',
      },
    },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    provideTenantTheme(),
  ],
};
