import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonContent, RouterLink],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  twoFactorEnabled = localStorage.getItem('ax-twofactor') === 'true';

  constructor(private arena: ArenaService, private router: Router) {}

  manageTwoFactor() {
    this.twoFactorEnabled = !this.twoFactorEnabled;
    localStorage.setItem('ax-twofactor', String(this.twoFactorEnabled));
    const status = this.twoFactorEnabled ? 'enabled' : 'disabled';
    window.alert(`Two-factor authentication ${status}.`);
  }

  confirmDeleteAccount() {
    const confirmed = window.confirm(
      'Deleting your account will sign you out and clear local data. Continue?'
    );
    if (!confirmed) return;
    localStorage.clear();
    this.arena.logout();
    this.router.navigateByUrl('/auth/login');
  }

  logout() {
    this.arena.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
