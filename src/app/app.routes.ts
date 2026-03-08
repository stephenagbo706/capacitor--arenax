import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'welcome',
    loadComponent: () => import('./pages/welcome/welcome.page').then((m) => m.WelcomePage),
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./pages/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./pages/auth/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'auth/forgot',
    loadComponent: () => import('./pages/auth/forgot/forgot.page').then((m) => m.ForgotPage),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'find-players',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/find-players/find-players.page').then((m) => m.FindPlayersPage),
  },
  {
    path: 'matches',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/matches/matches.page').then((m) => m.MatchesPage),
  },
  {
    path: 'matches/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/match-details/match-details.page').then((m) => m.MatchDetailsPage),
  },
  {
    path: 'tournaments',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/tournaments/tournaments.page').then((m) => m.TournamentsPage),
  },
  {
    path: 'spotlight',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/spotlight/spotlight.page').then((m) => m.SpotlightPage),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/chat-list/chat-list.page').then((m) => m.ChatListPage),
  },
  {
    path: 'chat/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/chat/chat.page').then((m) => m.ChatPage),
  },
  {
    path: 'wallet',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/wallet/wallet.page').then((m) => m.WalletPage),
  },
  {
    path: 'wallet/deposit',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/deposit/deposit.page').then((m) => m.DepositPage),
  },
  {
    path: 'wallet/withdraw',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/withdraw/withdraw.page').then((m) => m.WithdrawPage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'profile/edit',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/edit-profile/edit-profile.page').then((m) => m.EditProfilePage),
  },
  {
    path: 'notifications',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/notifications/notifications.page').then((m) => m.NotificationsPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'result-upload/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/result-upload/result-upload.page').then((m) => m.ResultUploadPage),
  },
  {
    path: '',
    redirectTo: 'welcome',
    pathMatch: 'full',
  },
];
