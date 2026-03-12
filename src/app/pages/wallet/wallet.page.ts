import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DatePipe, NgForOf, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonToggle } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [CommonModule, IonContent, IonToggle, AsyncPipe, NgForOf, TitleCasePipe, DatePipe, RouterLink, BottomNavComponent],
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage {
  user$ = this.arena.currentUser$;
  transactions$ = this.arena.transactions$;
  nairaBalance = 0;
  usdBalance = 0;
  preferredCurrency: 'NGN' | 'USD' = this.loadPreferredCurrency();

  constructor(private arena: ArenaService) {}

  setPreferredCurrency(currency: WalletPage['preferredCurrency']) {
    this.preferredCurrency = currency;
    localStorage.setItem('ax-preferred-currency', currency);
  }

  private loadPreferredCurrency(): WalletPage['preferredCurrency'] {
    const saved = localStorage.getItem('ax-preferred-currency');
    return saved === 'USD' ? 'USD' : 'NGN';
  }
}
