import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage {
  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  error = '';
  status = '';

  constructor(private auth: AuthService, private router: Router) {}

  scrollFieldIntoView(event: FocusEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    setTimeout(() => {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    }, 180);
  }

  async submit() {
    this.status = '';
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }
    const result = await this.auth.register(this.username, this.email, this.password);
    if (!result.ok) {
      this.error = result.message || 'Registration failed.';
      return;
    }
    this.error = '';
    this.status = 'Registration successful. You are now logged in.';
    setTimeout(() => this.router.navigateByUrl('/home'), 900);
  }
}
