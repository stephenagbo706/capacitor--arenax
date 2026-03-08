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
  constructor(private arena: ArenaService, private router: Router) {}

  logout() {
    this.arena.logout();
    this.router.navigateByUrl('/auth/login');
  }
}
