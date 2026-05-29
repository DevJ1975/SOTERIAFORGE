import { Routes } from '@angular/router';
import { authGuard, superadminGuard } from '@forge/auth';

export const appRoutes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./pages/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: '',
    canActivate: [authGuard, superadminGuard],
    loadComponent: () =>
      import('./pages/dashboard.component').then((m) => m.SuperadminDashboardComponent),
  },
  { path: '**', redirectTo: '' },
];
