import { Route } from '@angular/router';
import { Home } from './home';

export const appRoutes: Route[] = [
  { path: '', pathMatch: 'full', component: Home },
  {
    path: 'games/hazard-hunter',
    loadComponent: () => import('@forge/games').then((m) => m.HazardHuntComponent),
  },
  {
    path: 'games/peril',
    loadComponent: () => import('@forge/games').then((m) => m.PerilComponent),
  },
  { path: '**', redirectTo: '' },
];
