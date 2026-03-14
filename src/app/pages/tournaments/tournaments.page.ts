import { Component } from '@angular/core';
import { IonContent } from '@ionic/angular/standalone';
import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { Tournament } from '../../core/models/arena.models';

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
  statusMessage = '';
  errorMessage = '';
  confirmOpen = false;
  selectedTournament: Tournament | null = null;
  confirmError = '';
  confirmStatus = '';
  needsDeposit = false;
  currentBalance = 0;

  constructor(private arena: ArenaService, private router: Router) {}

  setTab(tab: string) {
    this.activeTab = tab;
  }

  get featured() {
    return this.tournaments$.value[0];
  }

  get filteredTournaments() {
    if (this.activeTab === 'All') return this.tournaments$.value;
    if (this.activeTab === 'Live') return this.tournaments$.value.filter((item) => item.status === 'live' || item.status === 'started');
    if (this.activeTab === 'Upcoming') return this.tournaments$.value.filter((item) => item.status === 'upcoming' || item.status === 'open');
    return this.tournaments$.value.filter((item) => item.status === 'ended' || item.status === 'closed');
  }

  joinFeaturedTournament() {
    if (!this.featured) return;
    this.openJoinModal(this.featured.id);
  }

  joinTournament(tournamentId: string) {
    this.openJoinModal(tournamentId);
  }

  isJoined(participantIds: string[]) {
    const currentUserId = this.arena.getCurrentUser()?.id || '';
    return participantIds.includes(currentUserId);
  }

  statusLabel(status: string) {
    if (status === 'upcoming') return 'OPEN';
    if (status === 'live') return 'LIVE';
    if (status === 'open') return 'OPEN';
    if (status === 'ready') return 'READY';
    if (status === 'full') return 'FULL';
    if (status === 'started') return 'STARTED';
    if (status === 'closed') return 'CLOSED';
    return 'CLOSED';
  }

  isJoinDisabled(tournament: Tournament) {
    if (this.isJoined(tournament.participants)) return true;
    return (
      tournament.status === 'ended' ||
      tournament.status === 'closed' ||
      tournament.status === 'live' ||
      tournament.status === 'started' ||
      tournament.status === 'ready' ||
      tournament.status === 'full'
    );
  }

  openJoinModal(tournamentId: string) {
    const current = this.arena.getCurrentUser();
    if (!current) {
      this.router.navigateByUrl('/auth/login');
      return;
    }

    const tournament = this.tournaments$.value.find((item) => item.id === tournamentId);
    if (!tournament) {
      this.errorMessage = 'Tournament not found.';
      return;
    }

    this.selectedTournament = tournament;
    this.confirmOpen = true;
    this.confirmError = '';
    this.confirmStatus = '';
    this.needsDeposit = false;
    this.currentBalance = current.walletBalance;
  }

  closeJoinModal() {
    this.confirmOpen = false;
    this.selectedTournament = null;
  }

  confirmJoin() {
    if (!this.selectedTournament) return;
    const result = this.arena.joinTournament(this.selectedTournament.id);
    if (!result?.ok) {
      if (result?.redirectTo) {
        this.router.navigateByUrl(result.redirectTo);
      }
      this.confirmError = result?.message || 'Unable to join tournament.';
      this.confirmStatus = '';
      this.needsDeposit = Boolean(result?.needsDeposit);
      return;
    }

    this.statusMessage = 'Tournament joined successfully. Entry fee charged.';
    this.errorMessage = '';
    this.confirmStatus = 'Entry fee paid and registration confirmed.';
    this.confirmError = '';
    const tournamentId = this.selectedTournament.id;
    this.closeJoinModal();
    this.router.navigateByUrl(`/tournaments/${tournamentId}`);
  }
}
