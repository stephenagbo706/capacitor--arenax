import { Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass, NgForOf, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { Tournament } from '../../core/models/arena.models';

type CalendarGame = 'DLS' | 'eFootball' | 'FIFA';
type CalendarStatus = 'Registration Open' | 'Closing Soon' | 'Ready' | 'Live' | 'Ended';

interface CalendarCard {
  id: string;
  month: 'January' | 'February' | 'March' | 'April';
  game: CalendarGame;
  tournamentName: string;
  registrationOpenDate: string;
  registrationCloseDate: string;
  matchStartDate: string;
  matchEndDate: string;
  prizePool: number;
  banner: string;
}

@Component({
  selector: 'app-tournaments',
  standalone: true,
  imports: [IonContent, NgForOf, NgIf, NgClass, DatePipe, DecimalPipe, RouterLink, BottomNavComponent],
  templateUrl: './tournaments.page.html',
  styleUrls: ['./tournaments.page.scss'],
})
export class TournamentsPage {
  private arena = inject(ArenaService);
  private router = inject(Router);

  readonly months: Array<CalendarCard['month']> = ['January', 'February', 'March', 'April'];
  activeMonth: CalendarCard['month'] = 'January';
  selectedGame: CalendarGame | 'All' = 'All';
  actionMessage = '';
  errorMessage = '';

  readonly cards: CalendarCard[] = [
    this.makeCard('jan-dls', 'January', 'DLS', 'DLS Winter Cup', '2026-01-10', '2026-01-12', '2026-01-15', '2026-01-25', 12000, 'assets/Dls 26.jpeg'),
    this.makeCard('jan-ef', 'January', 'eFootball', 'eFootball Winter Cup', '2026-01-10', '2026-01-12', '2026-01-15', '2026-01-25', 14000, 'assets/Efootball.jpeg'),
    this.makeCard('jan-fifa', 'January', 'FIFA', 'FIFA Winter Cup', '2026-01-10', '2026-01-12', '2026-01-15', '2026-01-25', 16000, 'assets/FIFA.jpeg'),
    this.makeCard('feb-dls', 'February', 'DLS', 'DLS Rising Stars Cup', '2026-02-03', '2026-02-06', '2026-02-10', '2026-02-26', 18000, 'assets/Dls.jpeg'),
    this.makeCard('feb-ef', 'February', 'eFootball', 'eFootball Rising Stars Cup', '2026-02-03', '2026-02-06', '2026-02-10', '2026-02-26', 20000, 'assets/Efootball.jpeg'),
    this.makeCard('feb-fifa', 'February', 'FIFA', 'FIFA Rising Stars Cup', '2026-02-03', '2026-02-06', '2026-02-10', '2026-02-26', 22000, 'assets/FIFA.jpeg'),
    this.makeCard('mar-dls', 'March', 'DLS', 'DLS Knockout Masters', '2026-03-01', '2026-03-03', '2026-03-04', '2026-03-25', 25000, 'assets/Dls 26.jpeg'),
    this.makeCard('mar-ef', 'March', 'eFootball', 'eFootball Knockout Masters', '2026-03-01', '2026-03-03', '2026-03-04', '2026-03-25', 27000, 'assets/Efootball.jpeg'),
    this.makeCard('mar-fifa', 'March', 'FIFA', 'FIFA Knockout Masters', '2026-03-01', '2026-03-03', '2026-03-04', '2026-03-25', 30000, 'assets/FIFA.jpeg'),
    this.makeCard('apr-dls', 'April', 'DLS', 'DLS Champions Showcase', '2026-04-01', '2026-04-04', '2026-04-05', '2026-04-20', 12000, 'assets/Dls.jpeg'),
    this.makeCard('apr-ef', 'April', 'eFootball', 'eFootball All-Star Arena', '2026-04-01', '2026-04-11', '2026-04-12', '2026-04-20', 13000, 'assets/Efootball.jpeg'),
    this.makeCard('apr-fifa', 'April', 'FIFA', 'FIFA Season Honors Clash', '2026-04-01', '2026-04-11', '2026-04-12', '2026-04-20', 14000, 'assets/FIFA.jpeg'),
  ];

  get tournaments() {
    return this.arena.tournaments$.value;
  }

  setMonth(month: CalendarCard['month']) {
    this.activeMonth = month;
    const section = document.getElementById(`month-${month.toLowerCase()}`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setGame(game: CalendarGame | 'All') {
    this.selectedGame = game;
  }

  filteredCards(month: CalendarCard['month']) {
    return this.cards.filter((card) => card.month === month && (this.selectedGame === 'All' || card.game === this.selectedGame));
  }

  getStatus(card: CalendarCard): CalendarStatus {
    const now = Date.now();
    const registrationOpen = Date.parse(card.registrationOpenDate);
    const registrationClose = Date.parse(card.registrationCloseDate);
    const matchStart = Date.parse(card.matchStartDate);
    const matchEnd = Date.parse(card.matchEndDate);

    if (now >= matchStart && now <= matchEnd) return 'Live';
    if (now > matchEnd) return 'Ended';
    if (now < registrationOpen) return 'Ready';
    if (now <= registrationClose) {
      const hoursLeft = (registrationClose - now) / (1000 * 60 * 60);
      return hoursLeft <= 48 ? 'Closing Soon' : 'Registration Open';
    }
    return 'Ready';
  }

  linkedTournament(card: CalendarCard): Tournament | undefined {
    const mappedGame = this.mapGame(card.game);
    const found = this.tournaments.find(
      (tournament) => tournament.game === mappedGame && tournament.title.toLowerCase() === card.tournamentName.toLowerCase()
    );
    return found;
  }

  playersJoined(card: CalendarCard): number {
    return this.linkedTournament(card)?.participants.length || 0;
  }

  maxPlayers(card: CalendarCard): number {
    return this.linkedTournament(card)?.maxPlayers || 128;
  }

  progress(card: CalendarCard): number {
    const now = Date.now();
    const start = Date.parse(card.matchStartDate);
    const end = Date.parse(card.matchEndDate);
    if (now <= start) return 0;
    if (now >= end) return 100;
    return Math.round(((now - start) / (end - start)) * 100);
  }

  countdown(target: string): string {
    const diff = Date.parse(target) - Date.now();
    if (diff <= 0) return '00d 00h 00m';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${days.toString().padStart(2, '0')}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
  }

  joinTournament(card: CalendarCard) {
    this.errorMessage = '';
    this.actionMessage = '';
    const linked = this.linkedTournament(card);
    if (!linked) {
      this.errorMessage = `No active backend tournament found for ${card.tournamentName} yet.`;
      return;
    }

    const result = this.arena.joinTournament(linked.id);
    if (!result.ok) {
      this.errorMessage = result.message || 'Unable to join tournament.';
      if (result.redirectTo) {
        this.router.navigateByUrl(result.redirectTo);
      }
      return;
    }

    this.actionMessage = `Registered for ${card.tournamentName}. Entry confirmed.`;
  }

  viewTournament(card: CalendarCard) {
    const linked = this.linkedTournament(card);
    if (!linked) {
      this.errorMessage = 'Tournament details are not available yet.';
      return;
    }
    this.router.navigateByUrl(`/tournaments/${linked.id}`);
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

  upcomingNotifications() {
    const now = Date.now();
    return this.cards
      .filter((card) => Date.parse(card.matchStartDate) >= now)
      .slice(0, 4)
      .map((card) => `${card.tournamentName} starts (${new Date(card.matchStartDate).toDateString()})`);
  }

  private makeCard(
    id: string,
    month: CalendarCard['month'],
    game: CalendarGame,
    tournamentName: string,
    registrationOpenDate: string,
    registrationCloseDate: string,
    matchStartDate: string,
    matchEndDate: string,
    prizePool: number,
    banner: string,
  ): CalendarCard {
    return { id, month, game, tournamentName, registrationOpenDate, registrationCloseDate, matchStartDate, matchEndDate, prizePool, banner };
  }

  private mapGame(game: CalendarGame): Tournament['game'] {
    if (game === 'DLS') return 'Dream League Soccer';
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
      `DESCRIPTION:${card.game} tournament on ArenaX. Prize pool $${card.prizePool}.`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  private asIcsDate(date: Date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }
}
