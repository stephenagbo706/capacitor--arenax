import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DatePipe, NgForOf, NgIf } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { filter, map, shareReplay, take } from 'rxjs/operators';
import { ArenaService } from '../../core/services/arena.service';
import { SupportedGame } from '../../core/models/arena.models';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

type GameFilter = SupportedGame | 'All';

@Component({
  selector: 'app-seasons',
  standalone: true,
  imports: [CommonModule, IonContent, AsyncPipe, NgForOf, NgIf, DatePipe, BottomNavComponent],
  templateUrl: './seasons.page.html',
  styleUrls: ['./seasons.page.scss'],
})
export class SeasonsPage {
  scoringRules = ['Win match = 10 points', 'Tournament win = 100 points', 'Runner-up = 50 points', 'Semi-final = 25 points'];
  gameFilters: GameFilter[] = ['All', 'FIFA', 'eFootball', 'Dream League Soccer'];
  activeSeasonId: string | null = null;
  activeGame: GameFilter = 'All';

  seasons$ = this.arena.seasons$;
  private selectedSeasonId$ = new BehaviorSubject<string | null>(null);
  private selectedGame$ = new BehaviorSubject<GameFilter>('All');

  currentSeason$ = combineLatest([this.seasons$, this.selectedSeasonId$]).pipe(
    map(([seasons, selectedId]) => {
      const fallback = seasons[0] || null;
      if (!selectedId) return fallback;
      return seasons.find((season) => season.id === selectedId) || fallback;
    }),
    shareReplay(1)
  );

  filteredTournaments$ = combineLatest([this.currentSeason$, this.selectedGame$]).pipe(
    map(([season, selectedGame]) => {
      if (!season) return [];
      if (selectedGame === 'All') return season.tournaments;
      return season.tournaments.filter((tournament) => tournament.allowedGames.includes(selectedGame));
    })
  );

  leaderboard$ = combineLatest([this.currentSeason$, this.arena.users$]).pipe(
    map(([season, users]) => {
      if (!season) return [];
      return season.leaderboard.map((entry, index) => ({
        rank: index + 1,
        name: users.find((user) => user.id === entry.playerId)?.username || 'Player',
        points: entry.points,
      }));
    })
  );

  awards$ = this.currentSeason$.pipe(map((season) => season?.awards || []));

  constructor(private arena: ArenaService) {
    this.seasons$
      .pipe(filter((list) => list.length > 0), take(1))
      .subscribe((list) => this.selectedSeasonId$.next(list[0].id));
    this.selectedSeasonId$.subscribe((id) => {
      this.activeSeasonId = id;
    });
  }

  setSeason(seasonId: string) {
    this.selectedSeasonId$.next(seasonId);
  }

  setGame(filter: GameFilter) {
    this.selectedGame$.next(filter);
    this.activeGame = filter;
  }

  lookupPlayerName(id: string) {
    return this.arena.getUser(id)?.username || 'Player';
  }
}
