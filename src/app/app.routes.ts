import { Routes } from '@angular/router';

import { PublicLayoutComponent } from './core/layout/public-layout.component';
import { authGuard } from './core/auth/auth.guard';
import { superuserGuard } from './core/auth/superuser.guard';

export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      { path: 'home', data: { titleKey: 'nav.home' }, loadComponent: () => import('./features/home/home.component').then((m) => m.HomeComponent) },
      { path: 'features', data: { titleKey: 'nav.features' }, loadComponent: () => import('./features/features/features.component').then((m) => m.FeaturesComponent) },
      { path: 'pricing', data: { titleKey: 'nav.pricing' }, loadComponent: () => import('./features/pricing/pricing.component').then((m) => m.PricingComponent) },
      { path: 'support', data: { titleKey: 'nav.support' }, loadComponent: () => import('./features/support/support.component').then((m) => m.SupportComponent) },
      { path: 'about', data: { titleKey: 'nav.about' }, loadComponent: () => import('./features/about/about.component').then((m) => m.AboutComponent) },
      { path: 'privacy', data: { titleKey: 'privacy.title' }, loadComponent: () => import('./features/privacy/privacy.component').then((m) => m.PrivacyComponent) },
      { path: 'login', data: { titleKey: 'auth.login.title' }, loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
      { path: 'register', data: { titleKey: 'auth.register.title' }, loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent) },
      { path: 'forgot-password', data: { titleKey: 'auth.forgot.title' }, loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent) },
      { path: 'auth/confirm-email/:uid/:token', loadComponent: () => import('./features/auth/confirm-email.component').then((m) => m.ConfirmEmailComponent) },
      { path: 'auth/reset-password/:uid/:token', data: { titleKey: 'auth.reset.title' }, loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent) },
      { path: 'auth/magic-link/:token', loadComponent: () => import('./features/auth/magic-link-verify.component').then((m) => m.MagicLinkVerifyComponent) },
      { path: 'me', canActivate: [authGuard], data: { titleKey: 'me.title' }, loadComponent: () => import('./features/account/me.component').then((m) => m.MeComponent) },
      { path: 'subscription', canActivate: [authGuard], data: { titleKey: 'subscription.title' }, loadComponent: () => import('./features/account/subscription.component').then((m) => m.SubscriptionComponent) },
      { path: 'teams', canActivate: [authGuard], data: { titleKey: 'teams.title' }, loadComponent: () => import('./features/teams/teams-list.component').then((m) => m.TeamsListComponent) },
      { path: 'teams/join/:token', canActivate: [authGuard], loadComponent: () => import('./features/teams/accept-invite.component').then((m) => m.AcceptInviteComponent) },
      { path: 'teams/:id', canActivate: [authGuard], loadComponent: () => import('./features/teams/team-detail.component').then((m) => m.TeamDetailComponent) },
      { path: 'teams/:id/history', data: { titleKey: 'history.title' }, canActivate: [authGuard], loadComponent: () => import('./features/history/history-list.component').then((m) => m.HistoryListComponent) },
      { path: 'teams/:id/history/:date', canActivate: [authGuard], loadComponent: () => import('./features/history/history-detail.component').then((m) => m.HistoryDetailComponent) },
      { path: 'teams/:id/board', data: { titleKey: 'board.title' }, canActivate: [authGuard], loadComponent: () => import('./features/board/board.component').then((m) => m.BoardComponent) },
      { path: 'join', data: { titleKey: 'join.title' }, loadComponent: () => import('./features/join/join.component').then((m) => m.JoinComponent) },
      { path: 'join/:code', loadComponent: () => import('./features/join/join.component').then((m) => m.JoinComponent) },
      { path: 'room/:code', loadComponent: () => import('./features/room/room.component').then((m) => m.RoomComponent) },
      {
        path: 'staff/users', data: { titleKey: 'staff.users.title' },
        canActivate: [superuserGuard],
        loadComponent: () =>
          import('./features/staff/staff-users.component').then((m) => m.StaffUsersComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
