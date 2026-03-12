import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-tournaments',
  standalone: true,
  imports: [IonContent, DatePipe, NgForOf, NgIf, RouterLink, BottomNavComponent],
  templateUrl: './tournaments.page.html',
  styleUrls: ['./tournaments.page.scss'],
})
export class TournamentsPage {
  tabs = ['All', 'Live', 'Upcoming', 'Ended'];
  activeTab = 'All';

  tournaments$ = this.arena.tournaments$;
  currentUserId = this.arena.getCurrentUser()?.id || '';
  statusMessage = '';
  errorMessage = '';

  constructor(private arena: ArenaService) {}

  setTab(tab: string) {
    this.activeTab = tab;
  }

  get featured() {
    return this.tournaments$.value[0];
  }

  get filteredTournaments() {
    if (this.activeTab === 'All') return this.tournaments$.value;
    if (this.activeTab === 'Live') return this.tournaments$.value.filter((item) => item.status === 'live');
    if (this.activeTab === 'Upcoming') return this.tournaments$.value.filter((item) => item.status === 'upcoming');
    return this.tournaments$.value.filter((item) => item.status === 'ended');
  }

  joinFeaturedTournament() {
    if (!this.featured) return;
    this.joinTournament(this.featured.id);
  }

  joinTournament(tournamentId: string) {
    const result = this.arena.joinTournament(tournamentId);
    if (!result?.ok) {
      this.errorMessage = result?.message || 'Unable to join tournament.';
      this.statusMessage = '';
      return;
    }

    this.statusMessage = 'Tournament joined successfully. Entry fee locked in escrow.';
    this.errorMessage = '';
  }

  isJoined(participantIds: string[]) {
    return participantIds.includes(this.currentUserId);
  }

  statusLabel(status: string) {
    if (status === 'upcoming') return 'UPCOMING';
    if (status === 'live') return 'LIVE';
    return 'ENDED';
  }
}
