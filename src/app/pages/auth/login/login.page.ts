import { Component, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  @ViewChild('pageContent', { static: true }) pageContent?: IonContent;

  email = '';
  password = '';
  showPassword = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
    const result = await this.auth.login(this.email, this.password);
    if (!result.ok) {
      this.error = result.message || 'Login failed.';
      return;
    }
    this.error = '';
    this.router.navigateByUrl('/home');
  }

  async onInputFocus(event: FocusEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || !this.pageContent) {
      return;
    }

    setTimeout(async () => {
      const rect = target.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const safeBottom = viewportHeight - 24;

      if (rect.bottom <= safeBottom) {
        return;
      }

      const scrollDelta = rect.bottom - safeBottom;
      await this.pageContent?.scrollByPoint(0, scrollDelta, 250);
    }, 180);
  }
}
