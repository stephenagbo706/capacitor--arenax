import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DecimalPipe, NgForOf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { Match, UserProfile } from '../../core/models/arena.models';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, IonContent, AsyncPipe, NgForOf, DecimalPipe, RouterLink, BottomNavComponent],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage {
  user$ = this.arena.currentUser$;
  matches$ = this.arena.matches$;
  users$ = this.arena.users$;
  readonly avatarCycle = [
    'assets/ax-ui/logo.png',
    'assets/ax-ui/wel.jpg',
    'assets/ax-ui/summit-section.jpg',
    'assets/ax-ui/tournament-area.jpg',
  ];

  constructor(private arena: ArenaService) {}

  cycleProfileIcon(user: UserProfile) {
    const current = this.avatarCycle.indexOf(user.avatar);
    const nextIndex = current >= 0 ? (current + 1) % this.avatarCycle.length : 0;
    this.arena.updateProfile({ avatar: this.avatarCycle[nextIndex] });
  }

  getUserMatchResults(userId: string) {
    return this.matches$.value
      .filter((match) => (match.player1Id === userId || match.player2Id === userId) && !!match.winnerId)
      .sort((a, b) => Date.parse(b.verifiedAt || b.uploadedAt || b.createdAt) - Date.parse(a.verifiedAt || a.uploadedAt || a.createdAt));
  }

  getTotalMatches(user: UserProfile) {
    return user.wins + user.losses;
  }

  getGoalRate(user: UserProfile) {
    const total = this.getTotalMatches(user);
    if (!total) return 0;
    return (user.wins / total) * 100;
  }

  getRankPoints(user: UserProfile) {
    return Math.max(0, user.wins * 30 - user.losses * 8);
  }

  getRankDivision(user: UserProfile) {
    const points = this.getRankPoints(user);
    if (points >= 1500) return 'Diamond Division';
    if (points >= 1000) return 'Platinum Division';
    if (points >= 700) return 'Gold Division';
    if (points >= 350) return 'Silver Division';
    return 'Bronze Division';
  }

  getGlobalRank(userId: string) {
    const ranked = [...this.users$.value].sort((a, b) => this.getRankPoints(b) - this.getRankPoints(a));
    const index = ranked.findIndex((user) => user.id === userId);
    return index >= 0 ? index + 1 : ranked.length;
  }

  getNextTierProgress(user: UserProfile) {
    const points = this.getRankPoints(user);
    const tiers = [
      { min: 0, max: 350 },
      { min: 350, max: 700 },
      { min: 700, max: 1000 },
      { min: 1000, max: 1500 },
      { min: 1500, max: 1500 },
    ];
    const tier = tiers.find((item) => points >= item.min && points <= item.max) || tiers[0];
    if (tier.max === tier.min) return 100;
    return ((points - tier.min) / (tier.max - tier.min)) * 100;
  }

  getResultLabel(match: Match, userId: string) {
    return match.winnerId === userId ? 'WIN' : 'LOSS';
  }

  getResultClass(match: Match, userId: string) {
    return match.winnerId === userId ? 'win' : 'loss';
  }

  getOpponentName(match: Match, userId: string) {
    const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;
    return opponentId ? this.arena.getUser(opponentId)?.username || 'Unknown Player' : 'Pending Opponent';
  }
}
