import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../../core/services/arena.service';

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

  constructor(private arena: ArenaService, private router: Router) {}

  submit() {
    if (this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }
    const result = this.arena.register({ username: this.username, email: this.email, password: this.password });
    if (!result.ok) {
      this.error = result.message || 'Registration failed.';
      return;
    }
    this.router.navigateByUrl('/home');
  }
}
