import { Component } from '@angular/core';
import { DatePipe, DecimalPipe, NgFor, NgIf, TitleCasePipe, UpperCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { Match, Tournament, TransactionItem, UserProfile } from '../../core/models/arena.models';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [IonContent, RouterLink, NgIf, NgFor, DatePipe, DecimalPipe, UpperCasePipe, TitleCasePipe],
  templateUrl: './admin-dashboard.page.html',
  styleUrls: ['./admin-dashboard.page.scss'],
})
export class AdminDashboardPage {
  actionMessage = '';
  actionError = '';
  processingMatchId = '';

  constructor(private arena: ArenaService) {}

  get currentUser() {
    return this.arena.currentUser$.value;
  }

  get isAdmin() {
    return !!this.currentUser?.isAdmin;
  }

  get totalPlayers() {
    return this.arena.users$.value.length;
  }

  get liveMatchesCount() {
    return this.arena.matches$.value.filter((match) => match.status === 'live').length;
  }

  get pendingVerificationMatches() {
    return this.arena.getPendingVerificationMatches();
  }

  get pendingVerificationCount() {
    return this.pendingVerificationMatches.length;
  }

  get waitingMatchesCount() {
    return this.arena.matches$.value.filter((match) => match.status === 'waiting').length;
  }

  get totalEscrowLocked() {
    return this.arena.matches$.value
      .filter((match) => match.status === 'waiting' || match.status === 'live' || match.status === 'pending_verification')
      .reduce((sum, match) => sum + match.escrowTotal, 0);
  }

  get tournaments() {
    return this.arena.tournaments$.value.slice(0, 5);
  }

  get recentTransactions() {
    return this.arena.transactions$.value.slice(0, 6);
  }

  getUser(id?: string): UserProfile | undefined {
    if (!id) return undefined;
    return this.arena.getUser(id);
  }

  approveMatch(match: Match) {
    if (this.processingMatchId) return;
    this.actionMessage = '';
    this.actionError = '';
    this.processingMatchId = match.id;
    const result = this.arena.reviewPendingMatch(match.id, 'approved', 'Approved by admin dashboard.');
    if (!result.ok) {
      this.actionError = result.message || 'Could not approve this match.';
      this.processingMatchId = '';
      return;
    }
    this.actionMessage = `Approved ${match.game}. Winner payout released.`;
    this.processingMatchId = '';
  }

  rejectMatch(match: Match) {
    if (this.processingMatchId) return;
    const note = window.prompt('Add a rejection reason for the player (optional):', 'Screenshot is unclear.') || '';
    this.actionMessage = '';
    this.actionError = '';
    this.processingMatchId = match.id;
    const result = this.arena.reviewPendingMatch(match.id, 'rejected', note);
    if (!result.ok) {
      this.actionError = result.message || 'Could not reject this match.';
      this.processingMatchId = '';
      return;
    }
    this.actionMessage = `${match.game} result rejected. Players can re-upload proof.`;
    this.processingMatchId = '';
  }

  runPreview(match: Match) {
    const result = this.arena.runAiVerificationPreview(match.id);
    if (!result.ok) {
      this.actionError = result.message || 'AI preview failed.';
      return;
    }

    const confidence = typeof result.confidence === 'number' ? `${Math.round(result.confidence * 100)}%` : 'N/A';
    this.actionError = '';
    this.actionMessage = `AI preview: ${result.decision} (${confidence} confidence).`;
  }

  getTournamentStatusClass(status: Tournament['status']) {
    if (status === 'live' || status === 'started') return 'live';
    if (status === 'upcoming' || status === 'open' || status === 'ready') return 'upcoming';
    return 'ended';
  }

  getTransactionSign(item: TransactionItem) {
    if (item.type === 'withdraw' || item.type === 'stake_lock' || item.type === 'entry_lock' || item.type === 'tournament_entry_fee')
      return '-';
    return '+';
  }
}
