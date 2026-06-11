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
    canActivate: [authGuard],
    loadComponent: () => import('./courses/catalog.page').then((m) => m.CatalogPage),
  },
  {
    path: 'courses/:courseId',
    canActivate: [authGuard],
    loadComponent: () => import('./courses/player.page').then((m) => m.PlayerPage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'leaderboard',
    canActivate: [authGuard],
    loadComponent: () => import('./leaderboard/leaderboard.page').then((m) => m.LeaderboardPage),
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
