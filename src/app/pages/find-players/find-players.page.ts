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
  searchTerm = '';
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
    const query = this.searchTerm.trim().toLowerCase();
    return this.players$.value.filter((player) => {
      if (player.id === this.currentUserId) return false;
      if (!query) return true;
      const ids = `${player.gameId} ${Object.values(player.gameIds).join(' ')}`.toLowerCase();
      return player.username.toLowerCase().includes(query) || ids.includes(query);
    });
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
