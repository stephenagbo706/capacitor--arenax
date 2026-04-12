import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [IonContent, RouterLink],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage {
  twoFactorEnabled = localStorage.getItem('ax-twofactor') === 'true';

  constructor(private auth: AuthService, private router: Router) {}

  manageTwoFactor() {
    this.twoFactorEnabled = !this.twoFactorEnabled;
    localStorage.setItem('ax-twofactor', String(this.twoFactorEnabled));
    const status = this.twoFactorEnabled ? 'enabled' : 'disabled';
    window.alert(`Two-factor authentication ${status}.`);
  }

  async confirmDeleteAccount() {
    const confirmed = window.confirm(
      'Deleting your account will sign you out and clear local data. Continue?'
    );
    if (!confirmed) return;
    localStorage.clear();
    await this.auth.logout();
    this.router.navigateByUrl('/auth/login');
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
