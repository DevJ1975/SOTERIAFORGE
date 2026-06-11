import { InjectionToken } from '@angular/core';
import type { Firestore } from 'firebase/firestore';

/**
 * Injection token for the app-level Firestore instance. Apps provide it once
 * (e.g. `{ provide: FIRESTORE, useFactory: () => getFirestore(app) }`) so the
 * data-access layer stays free of Firebase initialization concerns.
 */
export const FIRESTORE = new InjectionToken<Firestore>('forge.firestore');
