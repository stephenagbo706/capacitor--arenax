import { Injectable } from '@angular/core';
import { Match, Season, SeasonLeaderboardEntry, SeasonTournament, SupportedGame, UserProfile } from '../models/arena.models';

export type FirestoreWriteFn = (path: string, payload: Record<string, unknown>) => Promise<void>;

interface TournamentTemplate {
  name: string;
  game: SupportedGame;
  registrationOpen: { month: string; day: number; yearOffset?: number };
  registrationClose: { month: string; day: number; yearOffset?: number };
  matchStart: { month: string; day: number; yearOffset?: number };
  matchEnd: { month: string; day: number; yearOffset?: number };
  entryFee: number;
  prizePool: number;
  matchType: SeasonTournament['matchType'];
  purpose: string;
  tier: SeasonTournament['tier'];
  platformFeePercent: number;
  rules: string[];
  banner: string;
  bracketStages: string[];
  chatHighlight: string;
  notifications: string[];
  players: number;
  subTournaments?: Array<{ name: string; game: SupportedGame }>;
}

@Injectable({ providedIn: 'root' })
export class SeasonAutomationService {
  private readonly baseCalendars: TournamentTemplate[] = this.buildCalendar();

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
    const registrationOpen = this.makeIsoDate(
      year,
      template.registrationOpen.month,
      template.registrationOpen.day,
      template.registrationOpen.yearOffset
    );
    const registrationClose = this.makeIsoDate(
      year,
      template.registrationClose.month,
      template.registrationClose.day,
      template.registrationClose.yearOffset
    );
    const matchStart = this.makeIsoDate(year, template.matchStart.month, template.matchStart.day, template.matchStart.yearOffset);
    const matchEnd = this.makeIsoDate(year, template.matchEnd.month, template.matchEnd.day, template.matchEnd.yearOffset);
    const playerIds = this.pickPlayers(players, template.players);

    return {
      id: this.uid(),
      name: `${template.name} ${year}`,
      month: template.matchStart.month,
      registrationOpen,
      registrationClose,
      matchStart,
      matchEnd,
      startDate: matchStart,
      endDate: matchEnd,
      players: template.players,
      entryFee: template.entryFee,
      prizePool: template.prizePool,
      platformFeePercent: template.platformFeePercent,
      matchType: template.matchType,
      duration: this.getDurationLabel(matchStart, matchEnd),
      purpose: template.purpose,
      tier: template.tier,
      rules: template.rules,
      allowedGames: [template.game],
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
      { title: 'ArenaX Football Player of the Year', badge: `🏆 ArenaX Football Champion ${year}` },
      { title: 'Best FIFA Player', badge: '🎮 FIFA Champion' },
      { title: 'Best eFootball Player', badge: '⚽ Best eFootball Player' },
      { title: 'Best DLS Player', badge: '🎮 DLS Champion' },
      { title: 'Rising Star', badge: '🌟 Rising Star' },
      { title: 'Most Consistent Player', badge: '🛡️ Most Consistent Player' },
    ];
  }

  private makeIsoDate(year: number, monthLabel: string, day: number, yearOffset = 0) {
    const resolvedYear = year + yearOffset;
    const month = new Date(`${monthLabel} 1, ${resolvedYear}`).getUTCMonth();
    return new Date(Date.UTC(resolvedYear, month, day, 18, 0, 0)).toISOString();
  }

  private getDurationLabel(startIso: string, endIso: string) {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 'TBD';
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return `${days} days`;
  }

  private buildBracketStages(players: number) {
    if (players >= 64) return ['Round of 64', 'Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    if (players >= 32) return ['Round of 32', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    if (players >= 24) return ['Round of 24', 'Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    if (players >= 16) return ['Round of 16', 'Quarterfinals', 'Semifinals', 'Final'];
    if (players >= 8) return ['Quarterfinals', 'Semifinals', 'Final'];
    return ['Final'];
  }

  private buildCalendar() {
    const config = {
      'Winter Cup': {
        entryFee: 5,
        prizePool: 250,
        players: 32,
        tier: 'beginner' as const,
        matchType: '1v1' as const,
        purpose: 'Season opener and momentum builder.',
      },
      'Rising Stars Cup': {
        entryFee: 8,
        prizePool: 400,
        players: 24,
        tier: 'beginner' as const,
        matchType: '1v1' as const,
        purpose: 'Emerging talent showcase.',
      },
      'Masters Championship': {
        entryFee: 12,
        prizePool: 700,
        players: 32,
        tier: 'pro' as const,
        matchType: '1v1' as const,
        purpose: 'Mid-spring competitive championship.',
      },
      'Summer Cup': {
        entryFee: 15,
        prizePool: 900,
        players: 32,
        tier: 'pro' as const,
        matchType: '1v1' as const,
        purpose: 'Mid-year summer event.',
      },
      'Pro League': {
        entryFee: 20,
        prizePool: 1200,
        players: 16,
        tier: 'pro' as const,
        matchType: '1v1' as const,
        purpose: 'League format with weekly matchups.',
      },
      'Global Championship': {
        entryFee: 25,
        prizePool: 1600,
        players: 32,
        tier: 'elite' as const,
        matchType: '1v1' as const,
        purpose: 'International spotlight tournament.',
      },
      'Champions Cup': {
        entryFee: 30,
        prizePool: 2200,
        players: 32,
        tier: 'elite' as const,
        matchType: '1v1' as const,
        purpose: 'Year-end champion showdown.',
      },
    };

    const platformFeeByTier = {
      beginner: 0.05,
      pro: 0.07,
      elite: 0.1,
    } as const;

    const build = (
      name: keyof typeof config,
      game: SupportedGame,
      banner: string,
      registrationOpen: TournamentTemplate['registrationOpen'],
      registrationClose: TournamentTemplate['registrationClose'],
      matchStart: TournamentTemplate['matchStart'],
      matchEnd: TournamentTemplate['matchEnd']
    ): TournamentTemplate => {
      const details = config[name];
      const rules = [
        `Standard ${game} rules apply.`,
        'Screenshot verification required for every match.',
        'Respect the official match window or risk disqualification.',
      ];
      const notifications = [
        `Registration closes ${this.formatMonthDay(registrationClose.month, registrationClose.day)}.`,
        `Matches begin ${this.formatMonthDay(matchStart.month, matchStart.day)}.`,
      ];

      return {
        name: `${game === 'Dream League Soccer' ? 'DLS' : game} ${name}`,
        game,
        registrationOpen,
        registrationClose,
        matchStart,
        matchEnd,
        entryFee: details.entryFee,
        prizePool: details.prizePool,
        matchType: details.matchType,
        purpose: details.purpose,
        tier: details.tier,
        platformFeePercent: platformFeeByTier[details.tier],
        rules,
        banner,
        bracketStages: this.buildBracketStages(details.players),
        chatHighlight: `${name} lobby opens during registration with daily admin check-ins.`,
        notifications,
        players: details.players,
      };
    };

    return [
      build(
        'Winter Cup',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'January', day: 1 },
        { month: 'January', day: 21 },
        { month: 'January', day: 25 },
        { month: 'February', day: 5 }
      ),
      build(
        'Rising Stars Cup',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'February', day: 15 },
        { month: 'March', day: 7 },
        { month: 'March', day: 10 },
        { month: 'March', day: 25 }
      ),
      build(
        'Masters Championship',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'April', day: 1 },
        { month: 'April', day: 21 },
        { month: 'April', day: 25 },
        { month: 'May', day: 10 }
      ),
      build(
        'Summer Cup',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'June', day: 1 },
        { month: 'June', day: 21 },
        { month: 'June', day: 25 },
        { month: 'July', day: 10 }
      ),
      build(
        'Pro League',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'August', day: 1 },
        { month: 'August', day: 21 },
        { month: 'August', day: 25 },
        { month: 'September', day: 10 }
      ),
      build(
        'Global Championship',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'October', day: 1 },
        { month: 'October', day: 21 },
        { month: 'October', day: 25 },
        { month: 'November', day: 10 }
      ),
      build(
        'Champions Cup',
        'Dream League Soccer',
        'assets/Dls%2026.jpeg',
        { month: 'November', day: 25 },
        { month: 'December', day: 15 },
        { month: 'December', day: 20 },
        { month: 'January', day: 5, yearOffset: 1 }
      ),
      build(
        'Winter Cup',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'January', day: 5 },
        { month: 'January', day: 25 },
        { month: 'January', day: 28 },
        { month: 'February', day: 10 }
      ),
      build(
        'Rising Stars Cup',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'February', day: 20 },
        { month: 'March', day: 10 },
        { month: 'March', day: 15 },
        { month: 'March', day: 30 }
      ),
      build(
        'Masters Championship',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'April', day: 5 },
        { month: 'April', day: 25 },
        { month: 'April', day: 28 },
        { month: 'May', day: 15 }
      ),
      build(
        'Summer Cup',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'June', day: 5 },
        { month: 'June', day: 25 },
        { month: 'June', day: 28 },
        { month: 'July', day: 15 }
      ),
      build(
        'Pro League',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'August', day: 5 },
        { month: 'August', day: 25 },
        { month: 'August', day: 28 },
        { month: 'September', day: 15 }
      ),
      build(
        'Global Championship',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'October', day: 5 },
        { month: 'October', day: 25 },
        { month: 'October', day: 28 },
        { month: 'November', day: 15 }
      ),
      build(
        'Champions Cup',
        'eFootball',
        'assets/Efootball.jpeg',
        { month: 'December', day: 1 },
        { month: 'December', day: 20 },
        { month: 'December', day: 23 },
        { month: 'January', day: 10, yearOffset: 1 }
      ),
      build(
        'Winter Cup',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'January', day: 10 },
        { month: 'January', day: 30 },
        { month: 'February', day: 1 },
        { month: 'February', day: 15 }
      ),
      build(
        'Rising Stars Cup',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'February', day: 25 },
        { month: 'March', day: 15 },
        { month: 'March', day: 18 },
        { month: 'April', day: 1 }
      ),
      build(
        'Masters Championship',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'April', day: 10 },
        { month: 'April', day: 30 },
        { month: 'May', day: 2 },
        { month: 'May', day: 20 }
      ),
      build(
        'Summer Cup',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'June', day: 10 },
        { month: 'June', day: 30 },
        { month: 'July', day: 2 },
        { month: 'July', day: 20 }
      ),
      build(
        'Pro League',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'August', day: 10 },
        { month: 'August', day: 30 },
        { month: 'September', day: 2 },
        { month: 'September', day: 20 }
      ),
      build(
        'Global Championship',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'October', day: 10 },
        { month: 'October', day: 30 },
        { month: 'November', day: 2 },
        { month: 'November', day: 20 }
      ),
      build(
        'Champions Cup',
        'FIFA',
        'assets/FIFA.jpeg',
        { month: 'December', day: 5 },
        { month: 'December', day: 25 },
        { month: 'December', day: 28 },
        { month: 'January', day: 15, yearOffset: 1 }
      ),
    ];
  }

  private formatMonthDay(month: string, day: number) {
    const shortMonth = month.slice(0, 3);
    return `${shortMonth} ${day}`;
  }

  private pickPlayers(players: UserProfile[], count: number) {
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(players[i % players.length].id);
    }
    return result;
  }
}
