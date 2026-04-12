import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, RouterLink],
  templateUrl: './forgot.page.html',
  styleUrls: ['./forgot.page.scss'],
})
export class ForgotPage {
  email = '';
  sent = false;
  error = '';

  constructor(private auth: AuthService) {}

  async submit() {
    const result = await this.auth.sendPasswordReset(this.email);
    if (!result.ok) {
      this.error = result.message;
      this.sent = false;
      return;
    }
    this.error = '';
    this.sent = true;
  }
}
