import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DatePipe, NgForOf, TitleCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-wallet',
  standalone: true,
  imports: [CommonModule, IonContent, AsyncPipe, NgForOf, TitleCasePipe, DatePipe, RouterLink, BottomNavComponent],
  templateUrl: './wallet.page.html',
  styleUrls: ['./wallet.page.scss'],
})
export class WalletPage {
  user$ = this.arena.currentUser$;
  transactions$ = this.arena.transactions$;

  constructor(private arena: ArenaService) {}
}
