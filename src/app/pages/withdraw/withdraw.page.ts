import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, NgFor, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { TransactionPinAuthComponent } from '../../shared/transaction-pin-auth/transaction-pin-auth.component';
import { PermissionService } from '../../core/services/permission.service';

type WithdrawView = 'form' | 'review' | 'auth' | 'success' | 'failure';
type WithdrawAuthorization = { type: 'pin'; pin: string } | { type: 'biometric'; biometricAssertionId: string };

@Component({
  selector: 'app-withdraw',
  standalone: true,
  imports: [CommonModule, IonContent, FormsModule, NgFor, NgIf, TransactionPinAuthComponent],
  templateUrl: './withdraw.page.html',
  styleUrls: ['./withdraw.page.scss'],
})
export class WithdrawPage implements OnInit {
  private arena = inject(ArenaService);
  private permissions = inject(PermissionService);

  amount = 1000;
  error = '';
  authError = '';
  referenceId = '';
  completedAt = '';
  securitySuccess = '';
  view: WithdrawView = 'form';
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
  setupPin = '';
  setupPinConfirm = '';
  hasTransactionPin = false;
  biometricAvailable = false;
  biometricLabel = 'Biometric';
  biometricMessage = '';
  biometricCanOpenSettings = false;
  pinLockedUntil = '';
  authMethod: 'pin' | 'biometric' = 'pin';
  securityLoading = false;
  processing = false;
  private readonly transactionPinReadyKey = 'arenax_transaction_pin_ready';

  ngOnInit() {
    this.loadWalletSecurity();
  }

  get formattedAmount() {
    const symbol = this.currency === 'NGN' ? '₦' : '$';
    return `${symbol}${Number(this.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  get canSubmitForm() {
    return !this.processing && Boolean(this.destination.trim()) && this.amount >= this.minAmount && this.amount <= this.maxAmount;
  }

  get canSaveTransactionPin() {
    return !this.processing && Boolean(this.setupPin.trim()) && Boolean(this.setupPinConfirm.trim());
  }

  get biometricStatusText() {
    if (this.securityLoading) return 'Checking biometric security on this device...';
    if (this.biometricAvailable) {
      return `${this.biometricLabel} is available. You can use it to authorize withdrawals after your transaction PIN is set.`;
    }
    return this.biometricMessage || 'Biometric authentication is unavailable on this device. Use Transaction PIN to authorize withdrawals.';
  }

  get withdrawalSuccessMessage() {
    if (this.status === 'processed') {
      return `${this.formattedAmount} withdrawal successful.`;
    }
    return `${this.formattedAmount} withdrawal request submitted successfully. Admin approval is required before payout is complete.`;
  }

  async loadWalletSecurity() {
    this.securityLoading = true;
    const result = await this.arena.getWalletSecurity();
    this.securityLoading = false;
    if (!result.ok) {
      this.error = result.message || 'Unable to load wallet security.';
      return;
    }
    this.hasTransactionPin = result.hasTransactionPin || this.hasSavedTransactionPinFlag();
    this.pinLockedUntil = result.pinLockedUntil || '';
    await this.refreshBiometricStatus();
    this.authMethod = this.biometricAvailable ? 'biometric' : 'pin';
  }

  async saveTransactionPin() {
    this.error = '';
    this.securitySuccess = '';
    const pin = this.setupPin.trim();
    const confirmPin = this.setupPinConfirm.trim();

    if (!/^\d{4,6}$/.test(pin)) {
      this.error = 'Transaction PIN must be 4 to 6 digits.';
      this.clearPinSetup();
      return;
    }

    if (pin !== confirmPin) {
      this.error = 'Transaction PIN confirmation does not match.';
      this.clearPinSetup();
      return;
    }

    this.processing = true;
    const result = await this.arena.setTransactionPin(pin);
    this.processing = false;
    this.clearPinSetup();

    if (!result.ok) {
      this.error = result.message || 'Unable to save transaction PIN.';
      return;
    }

    this.hasTransactionPin = true;
    localStorage.setItem(this.transactionPinReadyKey, 'true');
    this.pinLockedUntil = result.pinLockedUntil || '';
    await this.refreshBiometricStatus();
    this.authMethod = this.biometricAvailable ? 'biometric' : 'pin';
    this.securitySuccess = this.biometricAvailable
      ? `Transaction PIN set successfully. ${this.biometricLabel} is ready for withdrawal approval.`
      : 'Transaction PIN set successfully. Use it to approve withdrawals.';
    await this.permissions.notifySuccess();
  }

  reviewWithdrawal() {
    this.error = '';
    this.authError = '';
    this.securitySuccess = '';
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

    if (!Number.isFinite(this.amount) || this.amount < this.minAmount || this.amount > this.maxAmount) {
      this.error = `Withdrawal amount must be between ${this.minAmount} and ${this.maxAmount} units.`;
      return;
    }

    this.view = 'review';
  }

  editWithdrawal() {
    if (this.processing) return;
    this.view = 'form';
  }

  async continueToAuth() {
    this.error = '';
    this.authError = '';
    const pinReady = await this.ensureTransactionPinReady();
    if (!pinReady) {
      this.error = 'Set a transaction PIN before requesting a withdrawal.';
      this.view = 'form';
      return;
    }
    this.authMethod = this.biometricAvailable ? this.authMethod : 'pin';
    this.view = 'auth';
  }

  useAuthMethod(method: 'pin' | 'biometric') {
    this.authError = '';
    if (method === 'biometric' && !this.biometricAvailable) {
      this.authError = this.biometricStatusText;
      this.authMethod = 'pin';
      return;
    }
    this.authMethod = method;
  }

  async authorizeWithPin(pin: string) {
    await this.submitWithdrawal({ type: 'pin', pin });
  }

  async authorizeWithBiometric() {
    if (this.processing) return;
    this.processing = true;
    this.authError = '';
    const result = await this.permissions.authenticateBiometric();
    this.processing = false;

    if (result.state !== 'granted' || !result.assertionId) {
      this.authError = result.message || 'Biometric authentication failed. Use Transaction PIN instead.';
      this.authMethod = 'pin';
      return;
    }

    await this.submitWithdrawal({ type: 'biometric', biometricAssertionId: result.assertionId });
  }

  async openBiometricSettings() {
    this.error = '';
    this.authError = '';
    await this.permissions.openAppSettings();
    await this.refreshBiometricStatus();
  }

  async retry() {
    this.status = 'idle';
    this.statusMessage = '';
    this.referenceId = '';
    this.completedAt = '';
    this.authError = '';
    this.view = 'auth';
  }

  private async ensureTransactionPinReady() {
    if (this.hasTransactionPin) return true;

    const result = await this.arena.getWalletSecurity();
    if (result.ok) {
      this.hasTransactionPin = result.hasTransactionPin || this.hasSavedTransactionPinFlag();
      this.pinLockedUntil = result.pinLockedUntil || '';
    }

    return this.hasTransactionPin;
  }

  done() {
    this.status = 'idle';
    this.statusMessage = '';
    this.referenceId = '';
    this.completedAt = '';
    this.destination = '';
    this.view = 'form';
  }

  private async submitWithdrawal(authorization: WithdrawAuthorization) {
    if (this.processing) return;
    this.processing = true;
    this.error = '';
    this.authError = '';
    this.status = 'pending';
    this.statusMessage = 'Authorizing withdrawal...';

    const result = await this.arena.withdraw({
      amount: this.amount,
      currency: this.currency,
      method: this.selectedMethod,
      destination: this.destination,
      authorization,
    });

    this.processing = false;

    if (!result?.ok) {
      this.status = 'failed';
      this.statusMessage = result?.message || 'Withdrawal was not completed.';
      this.authError = this.statusMessage;
      this.view = 'failure';
      await this.permissions.notifyFailure();
      return;
    }

    const isProcessed = result.status === 'processed';
    this.status = isProcessed ? 'processed' : 'pending';
    this.statusMessage = this.withdrawalSuccessMessage;
    this.referenceId = result.referenceId || '';
    this.completedAt = new Date().toLocaleString();
    this.lastWithdrawalTimestamp = Date.now();
    this.view = 'success';
    await this.permissions.notifySuccess();
  }

  private clearPinSetup() {
    this.setupPin = '';
    this.setupPinConfirm = '';
  }

  private hasSavedTransactionPinFlag() {
    return localStorage.getItem(this.transactionPinReadyKey) === 'true';
  }

  private async refreshBiometricStatus() {
    const biometric = await this.permissions.checkBiometrics();
    this.biometricAvailable = biometric.state === 'granted';
    this.biometricLabel = biometric.label;
    this.biometricMessage = biometric.message || '';
    this.biometricCanOpenSettings = Boolean(biometric.canOpenSettings);
  }
}
