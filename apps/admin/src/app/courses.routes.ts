import { Routes } from '@angular/router';
import { provideCourseContentWebMcpTools } from './webmcp/course-content.tools';

/**
 * Course authoring area. Lazy-loaded so the WebMCP tools (and the upload SDK)
 * stay out of the initial bundle. While an author is here, in-browser AI agents
 * can read and edit course content; each tool re-checks role and tenant.
 */
export const courseRoutes: Routes = [
  {
    path: '',
    providers: [provideCourseContentWebMcpTools()],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/courses.component').then((m) => m.CoursesComponent),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./pages/course-editor.component').then((m) => m.CourseEditorComponent),
      },
    ],
  },
];
