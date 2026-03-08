import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-deposit',
  standalone: true,
  imports: [IonContent, FormsModule, NgIf],
  templateUrl: './deposit.page.html',
  styleUrls: ['./deposit.page.scss'],
})
export class DepositPage {
  amount = 50;
  error = '';

  constructor(private arena: ArenaService, private router: Router) {}

  submit() {
    const result = this.arena.deposit(this.amount);
    if (!result?.ok) {
      this.error = result?.message || 'Deposit failed.';
      return;
    }
    this.error = '';
    this.router.navigateByUrl('/wallet');
  }
}
