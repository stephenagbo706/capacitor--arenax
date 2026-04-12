import { Component } from '@angular/core';
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
  email = '';
  password = '';
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
}
