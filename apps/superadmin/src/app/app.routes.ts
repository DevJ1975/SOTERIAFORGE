import { Route } from '@angular/router';
import { Home } from './home';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  { path: '**', redirectTo: '' },
];
