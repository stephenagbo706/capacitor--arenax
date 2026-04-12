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

  constructor(private auth: AuthService, private router: Router) {}

  async submit() {
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
    this.router.navigateByUrl('/home');
  }
}
