import { Routes } from '@angular/router';
import { authGuard, superadminGuard } from '@assurance/auth';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./pages/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: '',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () =>
      import('./pages/dashboard.component').then((m) => m.SuperadminDashboardComponent),
  },
  {
    path: 'tenants',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () => import('./pages/tenants.component').then((m) => m.TenantsComponent),
  },
  {
    path: 'catalog',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () => import('./pages/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'analytics',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () => import('./pages/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'library',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () => import('./pages/library.component').then((m) => m.LibraryComponent),
  },
  {
    path: 'library/:id',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () =>
      import('./pages/library-editor.component').then((m) => m.LibraryEditorComponent),
  },
  { path: '**', redirectTo: '' },
];
