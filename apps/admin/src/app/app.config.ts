import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import { Firestore } from '@angular/fire/firestore';
import { ForgePreset } from '@forge/ui';
import {
  COURSE_REPOSITORY,
  DelegatingCourseRepository,
  FirestoreCourseRepository,
  LocalStorageCourseRepository,
} from '@forge/lms-core';
import { PrincipalStore, provideForgeFirebase } from '@forge/auth';
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
    {
      // Forge Studio persistence: tenant-scoped Firestore once signed in,
      // localStorage otherwise — the builder is agnostic to the switch.
      provide: COURSE_REPOSITORY,
      useFactory: () => {
        const db = inject(Firestore);
        const principal = inject(PrincipalStore);
        const tenantId = () => principal.tenantId();
        return new DelegatingCourseRepository({
          firestore: new FirestoreCourseRepository({ db, tenantId }),
          local: new LocalStorageCourseRepository(),
          useFirestore: () => tenantId() !== null,
        });
      },
    },
  ],
};
