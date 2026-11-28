import { Routes } from '@angular/router';
import { authGuard, tenantGuard, roleGuard } from '@assurance/auth';
import {
  ForbiddenComponent,
  ForgotPasswordComponent,
  LoginComponent,
  SetPasswordComponent,
} from '@assurance/auth-ui';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: SetPasswordComponent },
  {
    path: 'accept-invite',
    component: SetPasswordComponent,
    data: { mode: 'invite' },
  },
  { path: 'forbidden', component: ForbiddenComponent },
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
  {
    path: 'courses',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadChildren: () => import('./courses.routes').then((m) => m.courseRoutes),
  },
  {
    path: 'quizzes',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/quizzes.component').then((m) => m.QuizzesComponent),
  },
  {
    path: 'quizzes/:id',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/quiz-editor.component').then((m) => m.QuizEditorComponent),
  },
  {
    path: 'games',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/games.component').then((m) => m.GamesComponent),
  },
  {
    path: 'games/:id',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/game-editor.component').then((m) => m.GameEditorComponent),
  },
  {
    path: 'knowledge',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin')],
    loadComponent: () => import('./pages/knowledge.component').then((m) => m.KnowledgeComponent),
  },
  {
    path: 'coach-review',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () =>
      import('./pages/coach-review.component').then((m) => m.CoachReviewComponent),
  },
  {
    path: 'standards',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/standards.component').then((m) => m.StandardsComponent),
  },
  {
    path: 'reports',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent),
  },
  {
    path: 'analytics',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'cohorts',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/cohorts.component').then((m) => m.CohortsComponent),
  },
  {
    path: 'badges',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/badges.component').then((m) => m.BadgesComponent),
  },
  { path: '**', redirectTo: '' },
];
