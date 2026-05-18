import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonButton, IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, IonContent, IonGrid, IonRow, IonCol, IonButton, FormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  showPassword = false;
  error = '';
  status = '';

  ionViewWillEnter() {
    this.status = '';
    this.error = '';
  }

  async submit() {
    this.status = '';
    const result = await this.auth.login(this.email, this.password);
    if (!result.ok) {
      this.error = result.message || 'Login failed.';
      return;
    }
    this.error = '';
    this.status = 'Login successful.';
    setTimeout(() => this.router.navigateByUrl('/home'), 900);
  }
}
