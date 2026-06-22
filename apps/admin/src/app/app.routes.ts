import { Routes } from '@angular/router';
import { authGuard, tenantGuard, roleGuard } from '@assurance/auth';
import { ForbiddenComponent, ForgotPasswordComponent, LoginComponent } from '@assurance/auth-ui';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
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
    loadComponent: () => import('./pages/courses.component').then((m) => m.CoursesComponent),
  },
  {
    path: 'courses/:id',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () =>
      import('./pages/course-editor.component').then((m) => m.CourseEditorComponent),
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
    path: 'reports',
    canActivate: [authGuard, tenantGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./pages/reports.component').then((m) => m.ReportsComponent),
  },
  { path: '**', redirectTo: '' },
];
