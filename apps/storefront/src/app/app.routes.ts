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
    path: 'catalog',
    loadComponent: () => import('./catalog/catalog.page').then((m) => m.CatalogPage),
  },
  {
    path: 'thanks',
    loadComponent: () => import('./thanks/thanks.page').then((m) => m.ThanksPage),
  },
  {
    path: 'library',
    canActivate: [authGuard],
    loadComponent: () => import('./library/library.page').then((m) => m.LibraryPage),
  },
  { path: '**', redirectTo: '' },
];
