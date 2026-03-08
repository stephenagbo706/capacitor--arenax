import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../../core/services/arena.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, RouterLink],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  email = 'stephen@arenax.app';
  password = 'password';
  error = '';

  constructor(private arena: ArenaService, private router: Router) {}

  submit() {
    const result = this.arena.login(this.email, this.password);
    if (!result.ok) {
      this.error = result.message || 'Login failed.';
      return;
    }
    this.router.navigateByUrl('/home');
  }
}
