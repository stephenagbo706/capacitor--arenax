import { Component } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-join-game',
  standalone: true,
  imports: [IonContent, NgIf, BottomNavComponent],
  templateUrl: './join-game.page.html',
  styleUrls: ['./join-game.page.scss'],
})
export class JoinGamePage {
  roomGameId = '';
  statusMessage = '';
  errorMessage = '';

  constructor(private arena: ArenaService, private router: Router) {}

  setRoomGameId(event: Event) {
    this.roomGameId = (event.target as HTMLInputElement).value.toUpperCase();
  }

  joinGame() {
    this.errorMessage = '';
    this.statusMessage = '';

    const roomCode = this.roomGameId.trim();
    if (!roomCode) {
      this.errorMessage = 'Paste a room game ID to join.';
      return;
    }

    const result = this.arena.joinStakeMatchByRoomCode(roomCode);
    if (!result?.ok) {
      this.errorMessage = result?.message || 'Unable to join room.';
      return;
    }

    this.statusMessage = `Connected successfully. Room ${roomCode.toUpperCase()} is now LIVE.`;
    this.roomGameId = '';
  }

  openCreateMatch() {
    this.router.navigateByUrl('/matches');
  }
}
