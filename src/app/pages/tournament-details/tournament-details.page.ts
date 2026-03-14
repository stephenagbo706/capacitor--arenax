import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DatePipe, NgForOf, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { combineLatest, interval, map, of, startWith, switchMap } from 'rxjs';
import { distinctUntilChanged, filter, shareReplay } from 'rxjs/operators';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { UserProfile } from '../../core/models/arena.models';

type TournamentTab = 'Overview' | 'Players' | 'Matches' | 'Chat';

interface TournamentChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  type?: 'announcement';
  replyTo?: { sender: string; text: string };
  mention?: string;
}

@Component({
  selector: 'app-tournament-details',
  standalone: true,
  imports: [CommonModule, IonContent, AsyncPipe, NgForOf, NgIf, DatePipe, RouterLink, BottomNavComponent],
  templateUrl: './tournament-details.page.html',
  styleUrls: ['./tournament-details.page.scss'],
})
export class TournamentDetailsPage {
  tabs: TournamentTab[] = ['Overview', 'Players', 'Matches', 'Chat'];
  activeTab: TournamentTab = 'Overview';

  private tournamentId$ = this.route.paramMap.pipe(
    map((params) => params.get('id')),
    filter((id): id is string => Boolean(id)),
    distinctUntilChanged()
  );

  tournament$ = combineLatest([this.tournamentId$, this.arena.tournaments$]).pipe(
    map(([id, tournaments]) => tournaments.find((tournament) => tournament.id === id)),
    shareReplay(1)
  );

  countdown$ = this.tournament$.pipe(
    switchMap((tournament) =>
      tournament
        ? interval(1000).pipe(
            startWith(0),
            map(() => this.getCountdownLabel(tournament.startsAt))
          )
        : of('Loading timer...')
    ),
    shareReplay(1)
  );

  players$ = combineLatest([this.tournament$, this.arena.users$]).pipe(
    map(([tournament, users]) => {
      if (!tournament) return [] as UserProfile[];
      return tournament.participants
        .map((id) => users.find((user) => user.id === id))
        .filter((user): user is UserProfile => Boolean(user));
    }),
    shareReplay(1)
  );

  leaderboard$ = this.players$.pipe(
    map((players) =>
      players
        .map((player) => player)
        .sort((a, b) => b.wins - a.wins || b.goals - a.goals)
        .map((player, index) => ({
          rank: index + 1,
          name: player.username,
          wins: player.wins,
          losses: player.losses,
        }))
    ),
    shareReplay(1)
  );

  tournamentMatches$ = combineLatest([this.players$, this.arena.matches$]).pipe(
    map(([players, matches]) => {
      const participantIds = new Set(players.map((player) => player.id));
      return matches.filter(
        (match) =>
          participantIds.has(match.player1Id) || (match.player2Id ? participantIds.has(match.player2Id) : false)
      );
    }),
    shareReplay(1)
  );

  chatMessages$ = this.players$.pipe(
    map((players) => {
      if (!players.length) return [] as TournamentChatMessage[];
      const primary = players[0];
      const secondary = players[1] || primary;
      const admin = players[2] || primary;
      const messages: TournamentChatMessage[] = [
        {
          id: 'announcement',
          senderId: admin.id,
          text: 'Admin: Bracket locked. Please upload your screenshots before the first match.',
          timestamp: new Date(Date.now() - 15 * 60 * 1000),
          type: 'announcement',
        },
        {
          id: 'message-1',
          senderId: secondary.id,
          text: `Match ready! Room RM-4B9F is prepped for round 1. @${primary.username} ping when you are in the lobby.`,
          mention: `@${primary.username}`,
          timestamp: new Date(Date.now() - 8 * 60 * 1000),
          replyTo: { sender: admin.username, text: 'Screenshot verification required before match start.' },
        },
        {
          id: 'message-2',
          senderId: primary.id,
          text: 'Opponent joined · queueing for loading screen. Screenshot capture done.',
          timestamp: new Date(Date.now() - 2 * 60 * 1000),
          replyTo: { sender: secondary.username, text: 'Match ready! Room RM-4B9F is prepped for round 1.' },
        },
      ];
      return messages;
    }),
    shareReplay(1)
  );

  notifications = [
    { title: 'Match ready', body: 'Room RM-4B9F is live for round one.' },
    { title: 'Opponent joined', body: 'Your rival is online and awaiting kickoff.' },
    { title: 'Round starting', body: 'Countdown complete · referee pinged for kickoff.' },
    { title: 'Winner announced', body: 'Rewards processed to the ArenaX wallet.' },
  ];

  rules = [
    'No teaming or unsportsmanlike conduct.',
    'Screenshot verification is required for every live match.',
    'Follow the posted start window or forfeit your entry fee.',
    'Respect the admin decisions and match timers.',
  ];

  antiCheatFeatures = [
    'Screenshot verification',
    'Admin review for every match',
    'Player reporting and escalation',
    'Automatically send rewards to winners',
  ];

  chatFeatures = ['Message replies', 'Mentions (@player)', 'Admin announcements'];

  prizeDistribution = [
    '70% to the champion',
    '20% to the runner-up',
    '10% reserved for ArenaX upkeep (automatically routed to the ArenaX wallet)',
  ];

  constructor(private arena: ArenaService, private route: ActivatedRoute) {}

  setTab(tab: TournamentTab) {
    this.activeTab = tab;
  }

  formatStatus(status: string) {
    if (status === 'live') return 'LIVE';
    if (status === 'upcoming') return 'UPCOMING';
    return 'ENDED';
  }

  findPlayer(players: UserProfile[], id: string) {
    return players.find((player) => player.id === id);
  }

  private getCountdownLabel(startAt: string) {
    const startMs = Date.parse(startAt);
    if (Number.isNaN(startMs)) return 'Timing TBD';
    const diffMs = startMs - Date.now();
    if (diffMs <= 0) return 'Live now';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const parts = [];
    if (days) parts.push(`${days}d`);
    parts.push(`${hours.toString().padStart(2, '0')}h`);
    parts.push(`${minutes.toString().padStart(2, '0')}m`);
    return parts.join(' ');
  }
}
