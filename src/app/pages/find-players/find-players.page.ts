import { Component } from '@angular/core';
import { DecimalPipe, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-find-players',
  standalone: true,
  imports: [IonContent, NgForOf, NgIf, DecimalPipe, FormsModule, BottomNavComponent],
  templateUrl: './find-players.page.html',
  styleUrls: ['./find-players.page.scss'],
})
export class FindPlayersPage {
  players$ = this.arena.users$;
  currentUserId = this.arena.getCurrentUser()?.id || '';
  modalOpen = false;
  selectedPlayerId = '';
  supportedGames = ['eFootball', 'Dream League Soccer', 'FIFA', 'Call of Duty Mobile'];
  game = 'FIFA';
  stake = 25;
  matchTime = 'Tonight · 9:30 PM';
  statusMessage = '';
  errorMessage = '';

  constructor(private arena: ArenaService) {}

  openChallenge(playerId: string) {
    this.selectedPlayerId = playerId;
    this.modalOpen = true;
    this.errorMessage = '';
    this.statusMessage = '';
  }

  closeModal() {
    this.modalOpen = false;
    this.statusMessage = '';
    this.errorMessage = '';
  }

  get listedPlayers() {
    return this.players$.value.filter((player) => player.id !== this.currentUserId);
  }

  sendChallenge() {
    if (!this.selectedPlayerId) {
      this.errorMessage = 'Select a player to challenge.';
      return;
    }
    const result = this.arena.sendChallenge(this.selectedPlayerId, this.game, this.stake, this.matchTime);
    if (!result?.ok) {
      this.errorMessage = result?.message || 'Unable to send challenge.';
      this.statusMessage = '';
      return;
    }
    this.errorMessage = '';
    this.statusMessage = 'Challenge sent and stake locked in escrow. Match is now waiting for join.';
  }
}
