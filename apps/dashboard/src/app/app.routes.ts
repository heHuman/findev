import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';

export const routes: Routes = [
  // Don't see the point in makind dashboard lazily loaded as its the main page of the app
  { path: '', component: DashboardComponent, title: 'Dashboard' },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/settings-component/settings.component').then((m) => m.SettingsComponent),
    title: 'Settings',
  },
  { path: '**', redirectTo: '' },
];
