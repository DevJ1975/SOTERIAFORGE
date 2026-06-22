import { Routes } from '@angular/router';
import { authGuard, tenantGuard } from '@assurance/auth';
import { ForbiddenComponent, ForgotPasswordComponent, LoginComponent } from '@assurance/auth-ui';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'forbidden', component: ForbiddenComponent },
  {
    path: '',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'courses',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () => import('./pages/courses.component').then((m) => m.CoursesComponent),
  },
  {
    path: 'courses/:id',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () =>
      import('./pages/course-detail.component').then((m) => m.CourseDetailComponent),
  },
  {
    path: 'leaderboard',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () =>
      import('./pages/leaderboard.component').then((m) => m.LeaderboardPageComponent),
  },
  {
    path: 'tutor',
    canActivate: [authGuard, tenantGuard],
    loadComponent: () => import('./pages/tutor.component').then((m) => m.TutorPageComponent),
  },
  { path: '**', redirectTo: '' },
];
