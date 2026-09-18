import { CommonModule, NgFor, NgIf } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-transaction-pin-auth',
  standalone: true,
  imports: [CommonModule, NgFor, NgIf],
  templateUrl: './transaction-pin-auth.component.html',
  styleUrls: ['./transaction-pin-auth.component.scss'],
})
export class TransactionPinAuthComponent {
  @Input() disabled = false;
  @Input() error = '';
  @Output() authorize = new EventEmitter<string>();

  pin = '';
  readonly maxLength = 6;
  readonly digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  get maskedSlots() {
    return Array.from({ length: this.maxLength }, (_, index) => index < this.pin.length);
  }

  addDigit(digit: string) {
    if (this.disabled || this.pin.length >= this.maxLength) return;
    this.pin = `${this.pin}${digit}`;
  }

  backspace() {
    if (this.disabled) return;
    this.pin = this.pin.slice(0, -1);
  }

  submit() {
    if (this.disabled || this.pin.length < 4) return;
    const pin = this.pin;
    this.pin = '';
    this.authorize.emit(pin);
  }
}
