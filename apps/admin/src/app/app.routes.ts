import { Route } from '@angular/router';
import { Home } from './home';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  {
    path: 'courses',
    loadComponent: () => import('./courses/course-list-page').then((m) => m.CourseListPage),
  },
  {
    path: 'courses/:courseId',
    loadComponent: () => import('./courses/course-builder-page').then((m) => m.CourseBuilderPage),
  },
  { path: '**', redirectTo: '' },
];
