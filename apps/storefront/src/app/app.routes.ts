import { Route } from '@angular/router';
import { Home } from './home';
import { Trust } from './trust';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  { path: 'trust', component: Trust, title: 'Trust & Security — Soteria FORGE' },
  { path: '**', redirectTo: '' },
];
