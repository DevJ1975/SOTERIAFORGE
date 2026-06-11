import { inject } from '@angular/core';
import { Route } from '@angular/router';
import { GAME_RESULT_SINK, HazardHuntComponent, PerilComponent } from '@forge/games';
import { FirestoreGameResultSink } from './game-result-sink';

/**
 * Safety Arcade routes. This file is itself lazy-loaded (loadChildren in
 * app.routes.ts), so the static '@forge/games' imports below stay in a
 * deferred chunk — providing GAME_RESULT_SINK from app.config.ts instead
 * would drag three.js/phaser into the initial bundle (and the mixed
 * lazy/static import would also trip @nx/enforce-module-boundaries).
 *
 * The route-level provider hands every game under /games the Firestore sink;
 * its report() throws 'unauthenticated' while signed out, which the games
 * translate into their 'Sign in to earn XP from the Arcade' copy.
 */
export const gamesRoutes: Route[] = [
  {
    path: '',
    providers: [{ provide: GAME_RESULT_SINK, useFactory: () => inject(FirestoreGameResultSink) }],
    children: [
      { path: 'hazard-hunter', component: HazardHuntComponent },
      { path: 'peril', component: PerilComponent },
    ],
  },
];
