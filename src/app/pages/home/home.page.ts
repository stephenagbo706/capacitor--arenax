import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AsyncPipe, CommonModule, NgForOf, NgIf } from '@angular/common';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, IonContent, RouterLink, AsyncPipe, NgForOf, NgIf, BottomNavComponent],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  user$ = this.arena.currentUser$;
  matches$ = this.arena.matches$;
  chats$ = this.arena.chats$;
  players$ = this.arena.users$;
  notifications$ = this.arena.notifications$;

  constructor(private arena: ArenaService) {}

  get activeMatches() {
    const nowMs = Date.now();
    const graceWindowMs = 3 * 60 * 1000;
    const currentUserId = this.user$.value?.id;

    return this.matches$.value
      .filter((match) => {
        if (match.status === 'waiting') {
          return !!currentUserId && (match.player1Id === currentUserId || match.player2Id === currentUserId);
        }
        if (match.status === 'live') return true;
        if (match.status !== 'verified' && match.status !== 'finished') return false;

        const endedAtMs = Date.parse(match.verifiedAt || match.uploadedAt || match.createdAt);
        if (Number.isNaN(endedAtMs)) return false;
        return nowMs - endedAtMs <= graceWindowMs;
      })
      .slice(0, 2);
  }

  get hasUnreadNotifications() {
    return this.notifications$.value.some((notification) => !notification.read);
  }

  getUser(id: string) {
    return this.arena.getUser(id);
  }

  getPlayerName(id?: string) {
    if (!id) return 'Awaiting opponent';
    return this.getUser(id)?.username || 'Player';
  }

  getMatchStateLabel(status: string) {
    if (status === 'waiting') return 'WAITING';
    if (status === 'live') return 'LIVE';
    return 'ENDED';
  }

  isEnded(status: string) {
    return status === 'verified' || status === 'finished';
  }

  isWaiting(status: string) {
    return status === 'waiting';
  }
}
