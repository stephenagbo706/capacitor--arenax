import { Component } from '@angular/core';
import { NgForOf, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-matches',
  standalone: true,
  imports: [IonContent, NgForOf, NgIf, BottomNavComponent],
  templateUrl: './matches.page.html',
  styleUrls: ['./matches.page.scss'],
})
export class MatchesPage {
  readonly totalSteps = 4;
  activeStep = 2;

  gameOptions: Array<{
    title: 'FIFA' | 'eFootball' | 'Dream League Soccer' | 'Call of Duty Mobile';
    image: string;
  }> = [
    { title: 'FIFA', image: 'assets/FIFA.jpeg' },
    { title: 'eFootball', image: 'assets/Efootball.jpeg' },
    { title: 'Dream League Soccer', image: 'assets/Dls 26.jpeg' },
    { title: 'Call of Duty Mobile', image: 'assets/Call-of-Duty-Mobile-groupe-de-guerriers.jpg' },
  ];

  selectedGame: 'FIFA' | 'eFootball' | 'Dream League Soccer' | 'Call of Duty Mobile' = 'FIFA';
  matchType: '1v1' | '2v2' = '1v1';
  extraTime = true;
  penalties = true;
  duration = 10;
  stake = 25;
  selectedPlatform: 'PlayStation' | 'Xbox' | 'PC' = 'PlayStation';

  matches$ = this.arena.matches$;
  currentUserId = this.arena.getCurrentUser()?.id || '';
  statusMessage = '';
  errorMessage = '';

  constructor(private router: Router, private arena: ArenaService) {}

  get progressWidth() {
    if (this.totalSteps <= 1) return '0%';
    const ratio = (this.activeStep - 1) / (this.totalSteps - 1);
    return `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  get openStakeMatches() {
    return this.matches$.value
      .filter((match) => match.status === 'waiting' && match.player1Id !== this.currentUserId)
      .slice(0, 4);
  }

  setStep(step: number) {
    this.activeStep = Math.max(1, Math.min(this.totalSteps, step));
  }

  toggleExtraTime() {
    this.extraTime = !this.extraTime;
  }

  togglePenalties() {
    this.penalties = !this.penalties;
  }

  setDuration(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) this.duration = value;
  }

  setStake(event: Event) {
    const rawValue = (event.target as HTMLInputElement).value;
    const value = Number(rawValue);
    if (Number.isNaN(value)) return;
    this.stake = Math.max(0, Math.round(value * 100) / 100);
  }

  setMatchType(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    if (value === '1v1' || value === '2v2') {
      this.matchType = value;
    }
  }

  setPlatform(platform: MatchesPage['selectedPlatform']) {
    this.selectedPlatform = platform;
  }

  setGame(game: MatchesPage['selectedGame']) {
    this.selectedGame = game;
  }

  get selectedGameImage() {
    return this.gameOptions.find((game) => game.title === this.selectedGame)?.image || 'assets/FIFA.jpeg';
  }

  joinMatch(matchId: string) {
    const result = this.arena.joinStakeMatch(matchId);
    if (!result?.ok) {
      this.errorMessage = result?.message || 'Unable to join match.';
      this.statusMessage = '';
      return;
    }
    this.errorMessage = '';
    this.statusMessage = 'Joined stake match. Status changed to LIVE.';
  }

  continueSetup() {
    this.errorMessage = '';
    this.statusMessage = '';

    if (this.activeStep < this.totalSteps) {
      this.activeStep += 1;
      return;
    }

    if (this.stake <= 0 || Number.isNaN(this.stake)) {
      this.errorMessage = 'Enter a valid stake amount.';
      return;
    }

    const result = this.arena.createStakeMatch({
      game: this.selectedGame,
      stake: this.stake,
      scheduledAt: `Today · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      platform: this.selectedPlatform,
      matchType: this.matchType,
      duration: this.duration,
      extraTime: this.extraTime,
      penalties: this.penalties,
    });

    if (!result?.ok) {
      this.errorMessage = 'message' in result && result.message ? result.message : 'Failed to create stake match.';
      return;
    }

    this.statusMessage = 'Stake match created successfully.';
    this.activeStep = 2;
  }

  openResult(matchId: string) {
    this.router.navigate(['/result-upload', matchId]);
  }
}
