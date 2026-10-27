import { Routes } from '@angular/router';
import { authGuard, tenantGuard } from '@assurance/auth';
import { ForbiddenComponent, ForgotPasswordComponent, LoginComponent } from '@assurance/auth-ui';
import type { SfCrumb } from '@assurance/ui';

/**
 * Route `data` keys read by the Forge shell in AppComponent:
 *  - `crumbs`:  breadcrumb trail (last = current page)
 *  - `sfShell`: 'none' renders without rail/top bar (auth pages);
 *               'dark' switches to the Forge Engage dark variant.
 */
export interface ForgeRouteData {
  crumbs?: readonly SfCrumb[];
  sfShell?: 'none' | 'dark';
}

const crumb = (label: string): readonly SfCrumb[] => [{ label }];

const placeholder = () =>
  import('./pages/forge-placeholder.component').then((m) => m.ForgePlaceholderPageComponent);

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent, data: { sfShell: 'none' } },
  { path: 'forgot-password', component: ForgotPasswordComponent, data: { sfShell: 'none' } },
  { path: 'forbidden', component: ForbiddenComponent, data: { sfShell: 'none' } },
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard, tenantGuard],
    data: { crumbs: crumb('Home') },
    loadComponent: () => import('./pages/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'courses',
    canActivate: [authGuard, tenantGuard],
    data: { crumbs: crumb('Courses') },
    loadComponent: () => import('./pages/courses.component').then((m) => m.CoursesComponent),
  },
  {
    path: 'courses/:id',
    canActivate: [authGuard, tenantGuard],
    data: { crumbs: [{ label: 'Courses', link: '/courses' }, { label: 'Course' }] },
    loadComponent: () =>
      import('./pages/course-detail.component').then((m) => m.CourseDetailComponent),
  },
  {
    path: 'courses/:courseId/lessons/:lessonId',
    canActivate: [authGuard, tenantGuard],
    data: {
      crumbs: [{ label: 'Courses', link: '/courses' }, { label: 'Course' }, { label: 'Lesson' }],
    },
    loadComponent: () => import('./pages/lesson/lesson.component').then((m) => m.LessonComponent),
  },
  {
    path: 'engage',
    canActivate: [authGuard, tenantGuard],
    data: {
      crumbs: crumb('Engage'),
      sfShell: 'dark',
    },
    loadComponent: () => import('./pages/engage/engage.component').then((m) => m.EngageComponent),
  },
  {
    path: 'progress',
    canActivate: [authGuard, tenantGuard],
    data: {
      crumbs: crumb('Progress'),
      title: 'My Progress',
      description:
        'XP, levels, badges and your crew standings. Leaderboards show crews only; your individual score stays private to you and your instructor.',
      phase: 'Arrives in Phase 3',
      icon: 'progress-star',
    },
    loadComponent: placeholder,
  },
  {
    path: 'analytics',
    canActivate: [authGuard, tenantGuard],
    data: {
      crumbs: crumb('Analytics'),
      title: 'Analytics',
      description: 'Your mastery by topic and time on task.',
      phase: 'Planned',
      icon: 'analytics',
    },
    loadComponent: placeholder,
  },
  {
    path: 'history',
    canActivate: [authGuard, tenantGuard],
    data: {
      crumbs: crumb('History'),
      title: 'History',
      description: 'Everything you have completed, with certificates and transcripts.',
      phase: 'Planned',
      icon: 'history',
    },
    loadComponent: placeholder,
  },
  {
    // Individual, tenant-wide ranking: kept reachable by URL but not linked from
    // the Forge rail until it is reworked to crews only (SFG-SPC-FRG-011).
    path: 'leaderboard',
    canActivate: [authGuard, tenantGuard],
    data: { crumbs: crumb('Leaderboard') },
    loadComponent: () =>
      import('./pages/leaderboard.component').then((m) => m.LeaderboardPageComponent),
  },
  {
    path: 'tutor',
    canActivate: [authGuard, tenantGuard],
    data: { crumbs: crumb('Ask Forge') },
    loadComponent: () => import('./pages/tutor.component').then((m) => m.TutorPageComponent),
  },
  { path: '**', redirectTo: '' },
];
