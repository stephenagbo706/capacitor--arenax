import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonButton, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, IonContent, IonGrid, IonRow, IonCol, IonButton, FormsModule, RouterLink],
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  username = '';
  email = '';
  password = '';
  confirmPassword = '';
  showPassword = false;
  showConfirmPassword = false;
  error = '';
  status = '';
  currentSlide = 0;

  nextSlide() {
    this.status = '';
    if (!this.username.trim() || !this.email.trim()) {
      this.error = 'Please enter your full name and email.';
      return;
    }
    this.error = '';
    this.currentSlide = 1;
  }

  previousSlide() {
    this.status = '';
    this.error = '';
    this.currentSlide = 0;
  }

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
