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
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth.component').then((m) => m.StorefrontAuthComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('@assurance/auth-ui').then((m) => m.ForgotPasswordComponent),
  },
  { path: '**', redirectTo: '' },
];
