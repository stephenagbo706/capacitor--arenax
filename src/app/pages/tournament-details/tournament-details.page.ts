import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DatePipe, NgForOf, NgIf } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { combineLatest, interval, map, of, startWith, switchMap } from 'rxjs';
import { distinctUntilChanged, filter, shareReplay } from 'rxjs/operators';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { Tournament, UserProfile } from '../../core/models/arena.models';

type TournamentTab = 'Overview' | 'Players' | 'Matches' | 'Chat';

@Component({
  selector: 'app-tournament-details',
  standalone: true,
  imports: [CommonModule, IonContent, AsyncPipe, NgForOf, NgIf, DatePipe, RouterLink, FormsModule, BottomNavComponent],
  templateUrl: './tournament-details.page.html',
  styleUrls: ['./tournament-details.page.scss'],
})
export class TournamentDetailsPage {
  tabs: TournamentTab[] = ['Overview', 'Players', 'Matches', 'Chat'];
  activeTab: TournamentTab = 'Overview';
  tournamentChatMessage = '';
  tournamentChatNotice = '';
  tournamentChatError = '';

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

  tournamentGroupChat$ = combineLatest([this.tournament$, this.arena.chats$]).pipe(
    map(([tournament]) => (tournament ? this.arena.getTournamentGroupChatForCurrentUser(tournament.id) : undefined)),
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
  ];

  constructor(private arena: ArenaService, private route: ActivatedRoute) {}

  setTab(tab: TournamentTab) {
    this.activeTab = tab;
  }

  formatStatus(status: string) {
    if (status === 'live') return 'LIVE';
    if (status === 'upcoming') return 'OPEN';
    if (status === 'open') return 'OPEN';
    if (status === 'ready') return 'READY';
    if (status === 'full') return 'FULL';
    if (status === 'started') return 'STARTED';
    if (status === 'closed') return 'CLOSED';
    return 'CLOSED';
  }

  findPlayer(players: UserProfile[], id: string | undefined) {
    if (!id) return undefined;
    return players.find((player) => player.id === id);
  }

  getUser(id: string) {
    return this.arena.getUser(id);
  }

  joinTournamentGroupChat(tournament: Tournament) {
    const result = this.arena.joinTournamentGroupChat(tournament.id);
    this.tournamentChatError = '';
    this.tournamentChatNotice = '';
    if (!result.ok) {
      this.tournamentChatError = result.message || 'Unable to join tournament chat.';
      return;
    }
    this.tournamentChatNotice = result.message || 'Joined tournament group chat.';
  }

  sendTournamentGroupMessage(tournament: Tournament) {
    const text = this.tournamentChatMessage.trim();
    if (!text) return;
    const chat = this.arena.getTournamentGroupChatForCurrentUser(tournament.id);
    if (!chat) {
      this.tournamentChatError = 'Join the group chat first.';
      return;
    }
    this.arena.sendMessage(chat.id, { text });
    this.tournamentChatMessage = '';
    this.tournamentChatError = '';
  }

  getRegisteredTeamName(tournament: { participants: string[]; entries?: { userId: string; username: string }[] }) {
    const currentUser = this.arena.getCurrentUser();
    if (!currentUser) return '';

    const entry = tournament.entries?.find((item) => item.userId === currentUser.id);
    if (entry?.username) return `Team ${entry.username}`;

    if (tournament.participants.includes(currentUser.id)) {
      const username = this.arena.getUser(currentUser.id)?.username || currentUser.username;
      return `Team ${username}`;
    }

    return '';
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
