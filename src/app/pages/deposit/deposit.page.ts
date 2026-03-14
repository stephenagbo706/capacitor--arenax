import { Component } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-deposit',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, NgFor, NgIf],
  templateUrl: './deposit.page.html',
  styleUrls: ['./deposit.page.scss'],
})
export class DepositPage {
  amount = 500;
  error = '';
  referenceId = '';
  status: 'idle' | 'pending' | 'completed' | 'failed' = 'idle';
  statusMessage = '';
  currency: 'NGN' | 'USD' = 'NGN';
  paymentMethods = ['Bank transfer', 'Card', 'Mobile money', 'Paystack'];
  selectedMethod = this.paymentMethods[0];
  minAmount = 100;
  maxAmount = 500000;

  constructor(private arena: ArenaService) {}

  submit() {
    this.error = '';
    this.referenceId = '';
    this.statusMessage = '';
    this.status = 'pending';

    const result = this.arena.deposit({
      amount: this.amount,
      currency: this.currency,
      method: this.selectedMethod,
    });

    if (!result?.ok) {
      this.status = 'failed';
      this.statusMessage = result?.message || 'We could not process the deposit.';
      this.error = this.statusMessage;
      return;
    }

    const isCompleted = result.status === 'completed';
    this.status = isCompleted ? 'completed' : 'pending';
    this.statusMessage = isCompleted
      ? 'Deposit completed ✔ Funds are available in your wallet.'
      : 'Waiting for payment confirmation. We will update your wallet shortly.';
    this.referenceId = result.referenceId || '';
  }
}
