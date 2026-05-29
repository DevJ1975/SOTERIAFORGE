import { Routes } from '@angular/router';
import { authGuard, tenantGuard, roleGuard } from '@forge/auth';

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
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () =>
      import('./pages/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
  },
  {
    path: 'members',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/members.component').then((m) => m.MembersComponent),
  },
  {
    path: 'branding',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/branding.component').then((m) => m.BrandingComponent),
  },
  { path: '**', redirectTo: '' },
];
