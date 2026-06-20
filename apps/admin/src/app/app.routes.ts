import { Route } from '@angular/router';
import { authGuard, ForgeLogin, roleGuard } from '@forge/auth';
import { Home } from './home';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  // Static import: @forge/auth is already in the initial bundle (shell button,
  // guards, Firebase providers), so lazy-loading it would be a false economy
  // and trips the lazy-vs-static module boundary lint rule.
  { path: 'login', component: ForgeLogin },
  {
    path: 'courses',
    canActivate: [authGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./courses/course-list-page').then((m) => m.CourseListPage),
  },
  {
    path: 'courses/:courseId',
    canActivate: [authGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () => import('./courses/course-builder-page').then((m) => m.CourseBuilderPage),
  },
  {
    path: 'live-sessions',
    canActivate: [authGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () =>
      import('./live-sessions/live-sessions-list-page').then((m) => m.LiveSessionsListPage),
  },
  {
    path: 'live-sessions/:sessionId',
    canActivate: [authGuard, roleGuard('tenant_admin', 'instructor')],
    loadComponent: () =>
      import('./live-sessions/live-session-detail-page').then((m) => m.LiveSessionDetailPage),
  },
  { path: '**', redirectTo: '' },
];
