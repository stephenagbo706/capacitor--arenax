import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AsyncPipe, DecimalPipe, NgIf } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { timer } from 'rxjs';
import { Match } from '../../core/models/arena.models';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-match-details',
  standalone: true,
  imports: [IonContent, NgIf, AsyncPipe, DecimalPipe],
  templateUrl: './match-details.page.html',
  styleUrls: ['./match-details.page.scss'],
})
export class MatchDetailsPage {
  matchId = '';
  currentUserId = this.arena.getCurrentUser()?.id || '';
  error = '';
  clock$ = timer(0, 1000);

  constructor(private route: ActivatedRoute, private arena: ArenaService, private router: Router) {
    this.matchId = this.route.snapshot.paramMap.get('id') || '';
  }

  get match() {
    return this.arena.matches$.value.find((m) => m.id === this.matchId);
  }

  getUser(id: string) {
    return this.arena.getUser(id);
  }

  get isLive() {
    return this.match?.status === 'live';
  }

  get isWaiting() {
    return this.match?.status === 'waiting';
  }

  get isEnded() {
    const status = this.match?.status;
    return status === 'verified' || status === 'finished';
  }

  get liveStateLabel() {
    if (this.isLive) return 'LIVE';
    if (this.isWaiting) return 'WAITING';
    return 'ENDED';
  }

  get isParticipant() {
    const match = this.match;
    if (!match || !this.currentUserId) return false;
    return match.player1Id === this.currentUserId || match.player2Id === this.currentUserId;
  }

  get canAccessResultActions() {
    return this.isLive && this.isParticipant;
  }

  formatRules(match: Match) {
    const duration = typeof match.duration === 'number' ? `${match.duration} min` : '10 min';
    const extraTime = match.extraTime ? 'Extra Time ON' : 'Extra Time OFF';
    const penalties = match.penalties ? 'Penalties ON' : 'Penalties OFF';
    return `${duration}, ${extraTime}, ${penalties}`;
  }

  formatPlatform(match: Match) {
    if (!match.platform) return 'Cross-platform';
    if (match.platform === 'PlayStation') return 'PlayStation 5';
    return match.platform;
  }

  getMatchIconPath(gameName: string | undefined) {
    const game = (gameName || '').toLowerCase();
    if (game.includes('dream')) return 'assets/match-icons/dream-league-soccer.jpg';
    if (game.includes('call of duty') || game.includes('cod')) return 'assets/match-icons/call-of-duty.jpg';
    if (game.includes('efootball')) return 'assets/match-icons/efootball.jpg';
    return 'assets/match-icons/fifa-mobile.jpg';
  }

  getPlayerLabel(id: string | undefined) {
    if (!id) return 'Waiting...';
    if (id === this.currentUserId) return 'You';
    return this.getUser(id)?.username || 'Player';
  }

  getPlayerRecord(id: string | undefined) {
    if (!id) return 'Awaiting opponent';
    const player = this.getUser(id);
    if (!player) return 'No stats';
    return `Wins: ${player.wins} | Loss: ${player.losses}`;
  }

  getPlayerWinRate(id: string | undefined) {
    if (!id) return '--';
    const player = this.getUser(id);
    if (!player) return '--';
    const total = player.wins + player.losses;
    if (!total) return '0%';
    return `${Math.round((player.wins / total) * 100)}%`;
  }

  formatTimeLeft(match: Match, tick: number) {
    void tick;
    const durationMinutes = typeof match.duration === 'number' ? match.duration : 10;
    const totalSeconds = Math.max(0, durationMinutes * 60);
    const startedAtMs = Date.parse(match.startedAt || match.createdAt);
    if (Number.isNaN(startedAtMs) || match.status !== 'live') {
      return this.formatClock(totalSeconds);
    }
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    return this.formatClock(remainingSeconds);
  }

  private formatClock(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  joinMatch() {
    const result = this.arena.joinStakeMatch(this.matchId);
    if (!result?.ok) {
      this.error = result?.message || 'Could not join match.';
      return;
    }
    this.error = '';
  }

  openResultUpload() {
    this.router.navigate(['/result-upload', this.matchId]);
  }
}
