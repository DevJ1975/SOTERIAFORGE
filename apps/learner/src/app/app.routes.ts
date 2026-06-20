import { Route } from '@angular/router';
import { authGuard, ForgeLogin } from '@forge/auth';
import { Home } from './home';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  // Static import: @forge/auth is already in the initial bundle (shell button,
  // guards, Firebase providers), so lazy-loading it would be a false economy
  // and trips the lazy-vs-static module boundary lint rule.
  { path: 'login', component: ForgeLogin },
  {
    path: 'courses',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./features/catalog/catalog').then((m) => m.Catalog),
  },
  {
    path: 'courses/:courseId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/player/player').then((m) => m.Player),
  },
  {
    path: 'my-learning',
    canActivate: [authGuard],
    loadComponent: () => import('./features/my-learning/my-learning').then((m) => m.MyLearning),
  },
  {
    path: 'live-sessions',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/live-sessions/live-sessions-page').then((m) => m.LiveSessionsPage),
  },
  {
    path: 'live-sessions/:sessionId/join',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/live-sessions/join-session-page').then((m) => m.JoinSessionPage),
  },
  {
    path: 'downloads',
    canActivate: [authGuard],
    loadComponent: () => import('./features/downloads/downloads').then((m) => m.Downloads),
  },
  {
    path: 'games/hazard-hunter',
    canActivate: [authGuard],
    loadComponent: () => import('@forge/games').then((m) => m.HazardHuntComponent),
  },
  {
    path: 'games/peril',
    canActivate: [authGuard],
    loadComponent: () => import('@forge/games').then((m) => m.PerilComponent),
  },
  { path: '**', redirectTo: '' },
];
