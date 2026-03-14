import { Component } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-withdraw',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, NgFor, NgIf],
  templateUrl: './withdraw.page.html',
  styleUrls: ['./withdraw.page.scss'],
})
export class WithdrawPage {
  amount = 1000;
  error = '';
  referenceId = '';
  status: 'idle' | 'pending' | 'processed' | 'failed' = 'idle';
  statusMessage = '';
  currency: 'NGN' | 'USD' = 'NGN';
  withdrawMethods = ['Bank transfer', 'Mobile money / e-wallet', 'PayPal / Partner payout'];
  selectedMethod = this.withdrawMethods[0];
  destination = '';
  minAmount = 500;
  maxAmount = 200000;
  cooldownMs = 24 * 60 * 60 * 1000;
  lastWithdrawalTimestamp?: number;

  constructor(private arena: ArenaService) {}

  submit() {
    this.error = '';
    this.referenceId = '';
    this.statusMessage = '';

    if (this.lastWithdrawalTimestamp && Date.now() - this.lastWithdrawalTimestamp < this.cooldownMs) {
      this.error = 'Withdrawals can only be requested once every 24 hours.';
      return;
    }

    if (!this.destination.trim()) {
      this.error = 'Provide a payout destination (bank, mobile money, or PayPal).';
      return;
    }

    this.status = 'pending';

    const result = this.arena.withdraw({
      amount: this.amount,
      currency: this.currency,
      method: this.selectedMethod,
      destination: this.destination,
    });

    if (!result?.ok) {
      this.status = 'failed';
      this.statusMessage = result?.message || 'Unable to request withdrawal.';
      this.error = this.statusMessage;
      return;
    }

    const isProcessed = result.status === 'processed';
    this.status = isProcessed ? 'processed' : 'pending';
    this.statusMessage = isProcessed
      ? 'Withdrawal processed. Funds should hit your destination shortly.'
      : 'Withdrawal request submitted. Admin approval is required.';
    this.referenceId = result.referenceId || '';
    this.lastWithdrawalTimestamp = Date.now();
  }
}
