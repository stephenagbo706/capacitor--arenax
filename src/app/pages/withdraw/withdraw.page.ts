import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-withdraw',
  standalone: true,
  imports: [IonContent, FormsModule, NgIf],
  templateUrl: './withdraw.page.html',
  styleUrls: ['./withdraw.page.scss'],
})
export class WithdrawPage {
  amount = 25;
  error = '';

  constructor(private arena: ArenaService, private router: Router) {}

  submit() {
    const result = this.arena.withdraw(this.amount);
    if (!result?.ok) {
      this.error = result?.message || 'Withdrawal failed.';
      return;
    }
    this.error = '';
    this.router.navigateByUrl('/wallet');
  }
}
