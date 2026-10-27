import { InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { getApps, initializeApp } from 'firebase/app';
import { type Auth, getAuth } from 'firebase/auth';
import { ASSURANCE_ENV } from './assurance-environment';

/**
 * Firebase Auth (GCIP) instance from the plain `firebase` SDK — identity is the
 * one Firebase service the platform keeps (see docs/forge-platform-plan.md), so
 * it no longer goes through AngularFire.
 *
 * Browser only: on the server (SSR / prerender) this resolves to `null`, so
 * prerendering never initializes Auth (which rejects an empty build-time API
 * key) and every server render is signed out.
 *
 * Reuses the default Firebase app when one already exists; `initializeApp`
 * with identical options is otherwise idempotent.
 */
export const FIREBASE_AUTH = new InjectionToken<Auth | null>('FIREBASE_AUTH', {
  providedIn: 'root',
  factory: () => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return null;
    const app = getApps()[0] ?? initializeApp(inject(ASSURANCE_ENV).firebase);
    return getAuth(app);
  },
});
