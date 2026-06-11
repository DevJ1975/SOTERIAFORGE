import { Route } from '@angular/router';
import { authGuard, ForgeLogin, roleGuard } from '@forge/auth';
import { Home } from './home';

/**
 * Catalog curation is superadmin-only (mirrors the b2c catalog Firestore
 * rules). Exported so specs can assert the exact guard wiring on the route.
 */
export const superadminOnly = roleGuard('superadmin');

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  // Static import: @forge/auth is already in the initial bundle (shell button,
  // guards, Firebase providers), so lazy-loading it would be a false economy
  // and trips the lazy-vs-static module boundary lint rule.
  { path: 'login', component: ForgeLogin },
  {
    path: 'catalog',
    canActivate: [authGuard, superadminOnly],
    loadComponent: () => import('./catalog/catalog-page').then((m) => m.CatalogPage),
  },
  { path: '**', redirectTo: '' },
];
