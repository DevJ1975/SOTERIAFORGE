import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'catalog',
    loadComponent: () => import('./pages/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'account',
    loadComponent: () => import('./pages/account.component').then((m) => m.AccountComponent),
  },
  { path: '**', redirectTo: '' },
];
