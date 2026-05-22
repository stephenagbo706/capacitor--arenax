import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgForOf, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { Subscription, interval } from 'rxjs';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { Tournament, TournamentLifecycleState } from '../../core/models/arena.models';
import { RealtimeService } from '../../core/services/realtime.service';

type CalendarGame = 'DLS' | 'eFootball' | 'FIFA';
type TournamentFilter = 'All' | 'Live' | 'Upcoming' | 'Ended';
type GameFilter = 'All' | CalendarGame;
type SeasonKey = 'WINTER' | 'RISING_STARS' | 'KNOCKOUT' | 'CHAMPIONS';

interface CalendarCard {
  id: string;
  seasonKey: SeasonKey;
  seasonName: string;
  game: CalendarGame;
  tournamentName: string;
  registrationOpenDate: string;
  registrationCloseDate: string;
  matchStartDate: string;
  matchEndDate: string;
  prizePool: number;
  entryFee: number;
  maxPlayers: number;
  participants: number;
  lifecycle: TournamentLifecycleState;
  banner: string;
  linkedTournamentId?: string;
}

@Component({
  selector: 'app-tournaments',
  standalone: true,
  imports: [IonContent, NgForOf, NgIf, NgClass, DatePipe, DecimalPipe, RouterLink, BottomNavComponent],
  templateUrl: './tournaments.page.html',
  styleUrls: ['./tournaments.page.scss'],
})
export class TournamentsPage implements OnInit, OnDestroy {
  private arena = inject(ArenaService);
  private realtime = inject(RealtimeService);
  private router = inject(Router);

  selectedStatus: TournamentFilter = 'All';
  selectedGame: GameFilter = 'All';
  actionMessage = '';
  errorMessage = '';
  nowMs = Date.now();
  feedbackCardId = '';
  feedbackType: 'error' | 'ok' | '' = '';
  feedbackMessage = '';

  private timerSub?: Subscription;
  private realtimeSub?: Subscription;
  private feedbackTimer?: ReturnType<typeof setTimeout>;

  private readonly seasonLabels: Record<SeasonKey, string> = {
    WINTER: 'Winter Season',
    RISING_STARS: 'Rising Stars Season',
    KNOCKOUT: 'Knockout Season',
    CHAMPIONS: 'Champions Season',
  };

  ngOnInit() {
    this.timerSub = interval(30_000).subscribe(() => {
      this.nowMs = Date.now();
    });

    this.realtimeSub = this.realtime.tournamentUpdate$.subscribe((payload) => {
      if (payload.message) this.actionMessage = payload.message;
      this.nowMs = Date.now();
    });
  }

  ngOnDestroy() {
    this.timerSub?.unsubscribe();
    this.realtimeSub?.unsubscribe();
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = undefined;
    }
  }

  get cards(): CalendarCard[] {
    return this.arena.tournaments$.value
      .filter((tournament) => this.isManagedGame(tournament))
      .map((tournament) => this.toCard(tournament));
  }

  setStatusFilter(status: TournamentFilter) {
    this.selectedStatus = status;
  }

  setGameFilter(game: GameFilter) {
    this.selectedGame = game;
  }

  get featuredCard(): CalendarCard | undefined {
    const active = this.filteredCards().filter((card) => card.lifecycle !== 'completed');
    if (!active.length) return this.filteredCards()[0];
    return [...active].sort((a, b) => Date.parse(a.matchStartDate) - Date.parse(b.matchStartDate))[0];
  }

  get listCards(): CalendarCard[] {
    const featured = this.featuredCard;
    return this.filteredCards().filter((card) => card.id !== featured?.id);
  }

  get hasFilteredCards() {
    return this.filteredCards().length > 0;
  }

  get emptyStateMessage() {
    if (this.selectedStatus === 'Live') {
      return 'No live tournaments right now. Check Upcoming tournaments or the Calendar for the next kickoff.';
    }
    return 'No tournaments match your current filters yet.';
  }

  filteredCards() {
    return this.cards
      .filter((card) => {
        if (this.selectedGame !== 'All' && card.game !== this.selectedGame) return false;
        if (this.selectedStatus === 'All') return true;
        if (this.selectedStatus === 'Live') return card.lifecycle === 'live';
        if (this.selectedStatus === 'Ended') return card.lifecycle === 'completed';
        return card.lifecycle !== 'live' && card.lifecycle !== 'completed';
      })
      .sort((a, b) => this.sortByPriority(a, b));
  }

  private sortByPriority(a: CalendarCard, b: CalendarCard): number {
    const priority: Record<TournamentLifecycleState, number> = {
      live: 0,
      registration_open: 1,
      registration_closed: 2,
      upcoming: 3,
      completed: 4,
    };
    const diff = priority[a.lifecycle] - priority[b.lifecycle];
    if (diff !== 0) return diff;
    return Date.parse(a.matchStartDate) - Date.parse(b.matchStartDate);
  }

  lifecycleLabel(card: CalendarCard): string {
    if (card.lifecycle === 'registration_open') return 'Registration Open';
    if (card.lifecycle === 'registration_closed') return 'Registration Closed';
    if (card.lifecycle === 'live') return 'Live';
    if (card.lifecycle === 'completed') return 'Completed';
    return 'Upcoming';
  }

  countdownTo(targetIso: string): string {
    const diff = Date.parse(targetIso) - this.nowMs;
    if (diff <= 0) return '00d 00h 00m';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${days.toString().padStart(2, '0')}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  }

  statusClass(card: CalendarCard): string {
    if (card.lifecycle === 'live') return 'live';
    if (card.lifecycle === 'completed') return 'ended';
    if (card.lifecycle === 'registration_open') return 'reg-open';
    if (card.lifecycle === 'registration_closed') return 'reg-closed';
    return 'upcoming';
  }

  startsIn(card: CalendarCard): string {
    const diff = Date.parse(card.matchStartDate) - this.nowMs;
    if (diff <= 0) return card.lifecycle === 'live' ? 'Live now' : 'Started';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    return `${days}d ${hours}h`;
  }

  joinTournament(card: CalendarCard) {
    this.errorMessage = '';
    this.actionMessage = '';
    if (!card.linkedTournamentId) {
      this.setCardFeedback(card.id, 'error', `No active backend tournament found for ${card.tournamentName} yet.`);
      return;
    }

    const result = this.arena.joinTournament(card.linkedTournamentId);
    if (!result.ok) {
      this.setCardFeedback(card.id, 'error', result.message || 'Unable to join tournament.');
      if (result.redirectTo) {
        this.router.navigateByUrl(result.redirectTo);
      }
      return;
    }

    this.setCardFeedback(card.id, 'ok', `Registered for ${card.tournamentName}. Entry confirmed.`);
  }

  hasCardFeedback(cardId: string) {
    return this.feedbackCardId === cardId && !!this.feedbackMessage;
  }

  private setCardFeedback(cardId: string, type: 'error' | 'ok', message: string) {
    this.feedbackCardId = cardId;
    this.feedbackType = type;
    this.feedbackMessage = message;
    if (this.feedbackTimer) clearTimeout(this.feedbackTimer);
    this.feedbackTimer = setTimeout(() => {
      this.feedbackCardId = '';
      this.feedbackType = '';
      this.feedbackMessage = '';
      this.feedbackTimer = undefined;
    }, 3500);
  }

  viewTournament(card: CalendarCard) {
    if (!card.linkedTournamentId) {
      this.errorMessage = 'Tournament details are not available yet.';
      return;
    }
    this.router.navigateByUrl(`/tournaments/${card.linkedTournamentId}`);
  }

  setReminder(card: CalendarCard) {
    this.errorMessage = '';
    const text = `${card.tournamentName} starts on ${new Date(card.matchStartDate).toDateString()}.`;
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(() => {});
    }
    this.actionMessage = `Reminder set: ${text}`;
  }

  addToCalendar(card: CalendarCard) {
    const ics = this.buildIcs(card);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${card.tournamentName.replace(/\s+/g, '-')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    this.actionMessage = `${card.tournamentName} exported to calendar.`;
  }

  private isManagedGame(tournament: Tournament): tournament is Tournament & { game: 'Dream League Soccer' | 'eFootball' | 'FIFA' } {
    return tournament.game === 'Dream League Soccer' || tournament.game === 'eFootball' || tournament.game === 'FIFA';
  }

  private toCard(tournament: Tournament): CalendarCard {
    const game = this.mapGameFromTournament(tournament.game);
    const seasonKey = (tournament.seasonKey as SeasonKey) || 'WINTER';
    const lifecycle = this.resolveLifecycleFromDates(tournament);

    return {
      id: tournament.id,
      seasonKey,
      seasonName: this.seasonLabels[seasonKey],
      game,
      tournamentName: tournament.title,
      registrationOpenDate: tournament.registrationOpenAt || tournament.startsAt,
      registrationCloseDate: tournament.registrationCloseAt || tournament.startsAt,
      matchStartDate: tournament.startsAt,
      matchEndDate: tournament.endsAt || tournament.startsAt,
      prizePool: tournament.prizePool,
      entryFee: tournament.entryFee,
      maxPlayers: tournament.maxPlayers,
      participants: tournament.participants.length,
      lifecycle,
      banner: tournament.image,
      linkedTournamentId: tournament.id,
    };
  }

  private resolveLifecycleFromDates(tournament: Tournament): TournamentLifecycleState {
    const registrationOpen = Date.parse(tournament.registrationOpenAt || '');
    const registrationClose = Date.parse(tournament.registrationCloseAt || '');
    const start = Date.parse(tournament.startsAt || '');
    const end = Date.parse(tournament.endsAt || '');

    if (this.nowMs < registrationOpen) return 'upcoming';
    if (this.nowMs >= registrationOpen && this.nowMs <= registrationClose) return 'registration_open';
    if (this.nowMs > registrationClose && this.nowMs < start) return 'registration_closed';
    if (this.nowMs >= start && this.nowMs <= end) return 'live';
    return 'completed';
  }

  private mapGameFromTournament(game: Tournament['game']): CalendarGame {
    if (game === 'Dream League Soccer') return 'DLS';
    if (game === 'eFootball') return 'eFootball';
    return 'FIFA';
  }

  private buildIcs(card: CalendarCard) {
    const dtStamp = this.asIcsDate(new Date());
    const start = this.asIcsDate(new Date(card.matchStartDate));
    const end = this.asIcsDate(new Date(card.matchEndDate));
    const uid = `${card.id}@arenax`;
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ArenaX//Tournament Calendar//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${card.tournamentName}`,
      `DESCRIPTION:${card.seasonName} - ${card.game} tournament on ArenaX. Prize pool $${card.prizePool}.`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  private asIcsDate(date: Date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
}
