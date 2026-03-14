import { Injectable } from '@angular/core';
import { Match, Season, SeasonLeaderboardEntry, SeasonTournament, SupportedGame, UserProfile } from '../models/arena.models';

export type FirestoreWriteFn = (path: string, payload: Record<string, unknown>) => Promise<void>;

interface TournamentTemplate {
  name: string;
  month: string;
  startDay: number;
  endDay: number;
  entryFee: number;
  prizePool: number;
  matchType: SeasonTournament['matchType'];
  duration: string;
  purpose: string;
  tier: SeasonTournament['tier'];
  platformFeePercent: number;
  rules: string[];
  allowedGames: SupportedGame[];
  banner: string;
  bracketStages: string[];
  chatHighlight: string;
  notifications: string[];
  players: number;
  subTournaments?: Array<{ name: string; game: SupportedGame }>;
}

@Injectable({ providedIn: 'root' })
export class SeasonAutomationService {
  private readonly baseCalendars: TournamentTemplate[] = [
    {
      name: 'ArenaX New Year Cup',
      month: 'January',
      startDay: 10,
      endDay: 15,
      entryFee: 5,
      prizePool: 200,
      matchType: '1v1',
      duration: '6 days',
      purpose: 'Season kickoff tournament.',
      tier: 'beginner',
      platformFeePercent: 0.05,
      rules: ['Standard FIFA 1v1 rules', 'Screenshot verification required for finals.'],
      allowedGames: ['FIFA', 'eFootball', 'Dream League Soccer'],
      banner: 'assets/ax-ui/tournament-area.jpg',
      bracketStages: ['Round of 32', 'Round of 16', 'Quarterfinals', 'Final'],
      chatHighlight: 'New Year chat opens at 6 PM with admin announcements.',
      notifications: ['Registration closes January 5', 'Matches start January 10 at 6:00 PM UTC'],
      players: 32,
    },
    {
      name: 'ArenaX Spring Championship',
      month: 'March',
      startDay: 5,
      endDay: 12,
      entryFee: 10,
      prizePool: 500,
      matchType: '1v1',
      duration: '1 week',
      purpose: 'Spring showcase for the season.',
      tier: 'beginner',
      platformFeePercent: 0.06,
      rules: ['Respect the fixture window', 'No teaming or unauthorized coaching'],
      allowedGames: ['FIFA', 'eFootball', 'Dream League Soccer'],
      banner: 'assets/ax-ui/summit-section.jpg',
      bracketStages: ['Group stage', 'Playoffs', 'Finals'],
      chatHighlight: 'Spring lobby opens nightly at 8 PM.',
      notifications: ['Match registration closes March 1', 'Matches begin March 5'],
      players: 16,
    },
    {
      name: 'ArenaX Summer Clash',
      month: 'June',
      startDay: 10,
      endDay: 20,
      entryFee: 15,
      prizePool: 900,
      matchType: '2v2',
      duration: '10 days',
      purpose: 'Mid-season 2v2 clash and revenue booster.',
      tier: 'pro',
      platformFeePercent: 0.07,
      rules: ['Double elimination bracket', 'Admin review on every screenshot'],
      allowedGames: ['FIFA', 'eFootball', 'Dream League Soccer'],
      banner: 'assets/ax-ui/wel.jpg',
      bracketStages: ['Open qualifier', 'Top 32 bracket', 'Semi-Finals', 'Final'],
      chatHighlight: 'Summer Clash chat runs 24/7 with highlight announcements.',
      notifications: ['Lines open June 4 for team submissions', 'Matches begin June 10'],
      players: 32,
    },
    {
      name: 'ArenaX Pro League',
      month: 'August',
      startDay: 1,
      endDay: 31,
      entryFee: 20,
      prizePool: 1200,
      matchType: '2v2',
      duration: '4 weeks',
      purpose: 'Month-long league with weekly matches and ranking points.',
      tier: 'pro',
      platformFeePercent: 0.08,
      rules: ['Weekly fixtures with point drops', 'Live admin verification'],
      allowedGames: ['FIFA', 'eFootball', 'Dream League Soccer'],
      banner: 'assets/ax-ui/tournament-area.jpg',
      bracketStages: ['Week 1', 'Week 2', 'Week 3', 'Championship week'],
      chatHighlight: 'Pro League chat threads include mention reminders and admin posts.',
      notifications: ['Registration ends July 28', 'First fixtures rollout August 1'],
      players: 16,
    },
    {
      name: 'ArenaX Champions Cup',
      month: 'October',
      startDay: 10,
      endDay: 18,
      entryFee: 30,
      prizePool: 1500,
      matchType: '1v1',
      duration: '8 days',
      purpose: 'Elite competition for top-ranked players.',
      tier: 'elite',
      platformFeePercent: 0.1,
      rules: ['Invite-only bracket', 'Anti-cheat verification on every match'],
      allowedGames: ['FIFA', 'eFootball', 'Dream League Soccer'],
      banner: 'assets/ax-ui/summit-section.jpg',
      bracketStages: ['Top 32 bracket', 'Semi-finals', 'Grand Final'],
      chatHighlight: 'Announcements from admins with winner spotlight.',
      notifications: ['Champions invite drops September 20', 'Bracket locked October 10'],
      players: 32,
    },
    {
      name: 'ArenaX Winter Cup',
      month: 'December',
      startDay: 15,
      endDay: 25,
      entryFee: 35,
      prizePool: 2500,
      matchType: '2v2',
      duration: '11 days',
      purpose: 'Biggest tournament and end-of-year celebration.',
      tier: 'elite',
      platformFeePercent: 0.1,
      rules: ['Live stream finals', 'Automatic reward distribution'],
      allowedGames: ['FIFA', 'eFootball', 'Dream League Soccer'],
      banner: 'assets/ax-ui/tournament-area.jpg',
      bracketStages: ['Qualifiers', 'Top 64', 'Elite bracket', 'Winter Final'],
      chatHighlight: 'Winter Cup chat reflects winners and badge drops.',
      notifications: ['Qualifier invites December 1', 'Finals December 24'],
      players: 64,
      subTournaments: [
        { name: 'Winter FIFA Division', game: 'FIFA' },
        { name: 'Winter eFootball Sprint', game: 'eFootball' },
      ],
    },
  ];

  private scoringRules = {
    winMatch: 10,
    tournamentWin: 100,
    runnerUp: 50,
    semiFinal: 25,
  };

  private uid() {
    return crypto.randomUUID();
  }

  generateSeason(year: number, players: UserProfile[]): Season {
    const tournaments = this.baseCalendars.map((template) => this.buildTournament(template, year, players));
    return {
      id: this.uid(),
      title: `ArenaX Season ${year}`,
      year,
      tournaments,
      leaderboard: this.buildInitialLeaderboard(players),
      awards: this.buildSeasonAwards(year),
    };
  }

  calculatePlatformFee(totalPot: number, percent: number) {
    const platformFee = Number((totalPot * percent).toFixed(2));
    return {
      platformFee,
      winnerPrize: Number((totalPot - platformFee).toFixed(2)),
    };
  }

  async persistSeasonToFirestore(season: Season, writeFn: FirestoreWriteFn) {
    await writeFn(`seasons/${season.id}`, {
      title: season.title,
      year: season.year,
      leaderboard: season.leaderboard,
      awards: season.awards,
    });

    for (const tournament of season.tournaments) {
      await writeFn(`seasons/${season.id}/tournaments/${tournament.id}`, this.buildTournamentPayload(tournament));
    }
  }

  updateLeaderboardFromMatches(season: Season, matches: Match[], players: UserProfile[]) {
    const pointsMap = new Map<string, number>();
    players.forEach((player) => pointsMap.set(player.id, 0));

    matches.forEach((match) => {
      if (!match.winnerId) return;
      const prev = pointsMap.get(match.winnerId) || 0;
      pointsMap.set(match.winnerId, prev + this.scoringRules.winMatch);
    });

    const leaderboard: SeasonLeaderboardEntry[] = [...pointsMap.entries()]
      .map(([playerId, points]) => ({ playerId, points }))
      .sort((a, b) => b.points - a.points)
      .map((entry, index) => ({ rank: index + 1, playerId: entry.playerId, points: entry.points }));

    season.leaderboard = leaderboard;
    return leaderboard;
  }

  buildTournamentPayload(tournament: SeasonTournament) {
    const totalPot = tournament.entryFee * tournament.players;
    const { platformFee, winnerPrize } = this.calculatePlatformFee(totalPot, tournament.platformFeePercent);
    return {
      ...tournament,
      totalPot,
      platformFee,
      winnerPrize,
    };
  }

  private buildTournament(template: TournamentTemplate, year: number, players: UserProfile[]): SeasonTournament {
    const startDate = this.makeIsoDate(year, template.month, template.startDay);
    const endDate = this.makeIsoDate(year, template.month, template.endDay);
    const playerIds = this.pickPlayers(players, template.players);

    return {
      id: this.uid(),
      name: `${template.name} ${year}`,
      month: template.month,
      startDate,
      endDate,
      players: template.players,
      entryFee: template.entryFee,
      prizePool: template.prizePool,
      platformFeePercent: template.platformFeePercent,
      matchType: template.matchType,
      duration: template.duration,
      purpose: template.purpose,
      tier: template.tier,
      rules: template.rules,
      allowedGames: template.allowedGames,
      banner: template.banner,
      bracketStages: template.bracketStages,
      playerIds,
      chatHighlight: template.chatHighlight,
      notifications: template.notifications,
      subTournaments: template.subTournaments,
    };
  }

  private buildInitialLeaderboard(players: UserProfile[]): SeasonLeaderboardEntry[] {
    return players.slice(0, 5).map((player, index) => ({
      playerId: player.id,
      points: Math.max(0, 1000 - index * 50),
      rank: index + 1,
    }));
  }

  private buildSeasonAwards(year: number) {
    return [
      { title: 'ArenaX Player of the Year', badge: `🏆 ArenaX Champion ${year}` },
      { title: 'Best FIFA Player', badge: '🎮 FIFA Champion' },
      { title: 'Best eFootball Player', badge: '⚽ Best eFootball Player' },
      { title: 'Best DLS Player', badge: '🎮 DLS Champion' },
      { title: 'Rising Star', badge: '🌟 Rising Star' },
      { title: 'Most Consistent Player', badge: '🛡️ Most Consistent Player' },
    ];
  }

  private makeIsoDate(year: number, monthLabel: string, day: number) {
    const month = new Date(`${monthLabel} 1, ${year}`).getUTCMonth();
    return new Date(Date.UTC(year, month, day, 18, 0, 0)).toISOString();
  }

  private pickPlayers(players: UserProfile[], count: number) {
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(players[i % players.length].id);
    }
    return result;
  }
}
