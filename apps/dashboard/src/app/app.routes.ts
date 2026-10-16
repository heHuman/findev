import { Routes } from '@angular/router';
import { Dashboard } from './dashboard/dashboard';

export const routes: Routes = [
  // Don't see the point in makind dashboard lazily loaded as its the main page of the app
  { path: '', component: Dashboard, title: 'Dashboard' },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings').then((m) => m.Settings),
    title: 'Settings',
  },
  { path: '**', redirectTo: '' },
];
