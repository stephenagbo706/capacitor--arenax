import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { get, getDatabase, ref, remove, set } from 'firebase/database';
import { environment } from '../../../environments/environment';
import {
  ArenaActionResult,
  ArenaState,
  ChatThread,
  Challenge,
  FriendRequest,
  Match,
  NotificationItem,
  SpotlightPost,
  SupportedGame,
  Tournament,
  TournamentTier,
  TournamentBracket,
  TournamentBracketMatch,
  TournamentBracketRound,
  TournamentLifecycleState,
  TransactionItem,
  UserProfile,
  Season,
  Currency,
} from '../models/arena.models';
import { SeasonAutomationService, FirestoreWriteFn } from './season-automation.service';
import { RealtimeService } from './realtime.service';
import {
  InvitePlayerPayload,
  MatchUpdatePayload,
  SendMessagePayload,
  TournamentUpdatePayload,
} from '../models/realtime.models';

const STORAGE_KEY = 'arenax_state_v2';
const DEFAULT_CHAT_TEXTS = new Set([
  'Hey! Ready to battle? I am online now.',
  'Ready for the rematch tonight?',
  'Let me wrap this match and I will join.',
]);
const DEMO_USER_IDENTIFIERS = new Set([
  'shadow@arenax.app',
  'nova@arenax.app',
  'blaze@arenax.app',
  'community@arenax.app',
  'ShadowLynx',
  'NovaStrike',
  'BlazeWolf',
  'ArenaX Community',
]);
const DEFAULT_TOURNAMENT_ENTRY_FEE = 5;
const TOURNAMENT_PLATFORM_FEE_PERCENT = 0.1;
const MATCHMAKING_MINIMUM_STAKE = 1;
const MATCHMAKING_PLATFORM_FEE_RATE = 0.1;

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

@Injectable({ providedIn: 'root' })
export class ArenaService {
  private automation = inject(SeasonAutomationService);
  private realtime = inject(RealtimeService);

  private state: ArenaState;
  private firebaseDb = this.resolveFirebaseDb();
  private lastRoomSyncIssue: string | null = null;

  users$ = new BehaviorSubject<UserProfile[]>([]);
  currentUser$ = new BehaviorSubject<UserProfile | null>(null);
  challenges$ = new BehaviorSubject<Challenge[]>([]);
  matches$ = new BehaviorSubject<Match[]>([]);
  tournaments$ = new BehaviorSubject<Tournament[]>([]);
  spotlightPosts$ = new BehaviorSubject<SpotlightPost[]>([]);
  chats$ = new BehaviorSubject<ArenaState['chats']>([]);
  friendRequests$ = new BehaviorSubject<FriendRequest[]>([]);
  notifications$ = new BehaviorSubject<NotificationItem[]>([]);
  transactions$ = new BehaviorSubject<TransactionItem[]>([]);
  seasons$ = new BehaviorSubject<Season[]>([]);
  private spotlightLiveFeedTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.state = this.loadState();
    this.state.tournaments = this.withArenaXCalendarTournaments(this.state.tournaments, this.state.users);
    this.hydrateSubjects();
    this.ensureLatestSeason();
    this.bindRealtimeEvents();
    this.startSpotlightLiveFeed();
    this.currentUser$.subscribe((user) => {
      if (!user) {
        this.realtime.disconnect();
        return;
      }
      this.realtime.connect({
        userId: user.id,
        email: user.email,
        username: user.username,
      });
    });
  }

  login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (!normalizedEmail) return { ok: false, message: 'Email is required.' };
    if (!normalizedPassword) return { ok: false, message: 'Password is required.' };

    const user = this.state.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!user) return { ok: false, message: 'No account found for this email.' };

    const savedHash = this.state.credentials[user.id];
    if (!savedHash) return { ok: false, message: 'This account has no password set. Please reset your account.' };

    if (savedHash !== this.hashPassword(normalizedPassword)) {
      return { ok: false, message: 'Incorrect password.' };
    }

    this.state.currentUserId = user.id;
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  register(payload: { username: string; email: string; password: string }) {
    const username = payload.username.trim();
    const email = payload.email.trim().toLowerCase();
    const password = payload.password.trim();

    if (!username) return { ok: false, message: 'Username is required.' };
    if (!email) return { ok: false, message: 'Email is required.' };
    if (!password) return { ok: false, message: 'Password is required.' };
    if (password.length < 6) return { ok: false, message: 'Password must be at least 6 characters.' };

    const usernameExists = this.state.users.some((u) => u.username.toLowerCase() === username.toLowerCase());
    if (usernameExists) return { ok: false, message: 'Username is already taken.' };

    const exists = this.state.users.some((u) => u.email.toLowerCase() === email);
    if (exists) return { ok: false, message: 'Email is already registered.' };

    const profileId = `AX-${Math.floor(100000 + Math.random() * 900000)}`;
    const newUser: UserProfile = {
      id: uid(),
      username,
      email,
      gameId: profileId,
      gameIds: {
        eFootball: `EFB-${Math.floor(100000 + Math.random() * 900000)}`,
        'Dream League Soccer': `DLS-${Math.floor(100000 + Math.random() * 900000)}`,
        FIFA: `FIFA-${Math.floor(100000 + Math.random() * 900000)}`,
        'Call of Duty Mobile': `CODM-${Math.floor(100000 + Math.random() * 900000)}`,
      },
      avatar: 'assets/ax-ui/logo.png',
      wins: 0,
      losses: 0,
      goals: 0,
      walletBalance: 120,
      lockedBalance: 0,
      online: true,
    };

    this.state.users.unshift(newUser);
    this.state.credentials[newUser.id] = this.hashPassword(password);
    this.state.currentUserId = newUser.id;
    this.state.notifications.unshift({
      id: uid(),
      type: 'system',
      message: 'Welcome to ArenaX. Complete your Game IDs and start competing.',
      createdAt: now(),
      read: false,
    });
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  logout() {
    this.state.currentUserId = undefined;
    this.persist();
    this.hydrateSubjects();
  }

  syncFromAuthUser(payload: { uid: string; email: string; username: string }) {
    const email = payload.email.trim().toLowerCase();
    if (!email) return;

    const existing = this.state.users.find((user) => user.email.toLowerCase() === email);
    if (existing) {
      this.state.currentUserId = existing.id;
      const nextUsername = payload.username.trim();
      if (nextUsername && nextUsername !== existing.username) {
        this.state.users = this.state.users.map((user) =>
          user.id === existing.id
            ? {
                ...user,
                username: nextUsername,
              }
            : user
        );
      }
      this.persist();
      this.hydrateSubjects();
      return;
    }

    const randomCode = () => Math.floor(100000 + Math.random() * 900000);
    const profileId = `AX-${randomCode()}`;
    const newUser: UserProfile = {
      id: payload.uid || uid(),
      username: payload.username.trim() || email.split('@')[0] || 'ArenaX Player',
      email,
      gameId: profileId,
      gameIds: {
        eFootball: `EFB-${randomCode()}`,
        'Dream League Soccer': `DLS-${randomCode()}`,
        FIFA: `FIFA-${randomCode()}`,
        'Call of Duty Mobile': `CODM-${randomCode()}`,
      },
      avatar: 'assets/ax-ui/logo.png',
      wins: 0,
      losses: 0,
      goals: 0,
      walletBalance: 120,
      lockedBalance: 0,
      online: true,
    };

    this.state.users.unshift(newUser);
    this.state.currentUserId = newUser.id;
    this.persist();
    this.hydrateSubjects();
  }

  enableCurrentUserAdmin(): ArenaActionResult {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (current.isAdmin) return { ok: true };

    this.state.users = this.state.users.map((user) => (user.id === current.id ? { ...user, isAdmin: true } : user));
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  ensureLatestSeason(writeFn?: FirestoreWriteFn) {
    const currentYear = new Date().getFullYear();
    if (!this.state.seasons.find((season) => season.year === currentYear)) {
      const generated = this.automation.generateSeason(currentYear, this.state.users);
      this.state.seasons.unshift(generated);
      if (writeFn) {
        this.automation.persistSeasonToFirestore(generated, writeFn).catch(() => {});
      }
      this.persist();
      this.hydrateSubjects();
    }

    const currentSeason = this.state.seasons.find((season) => season.year === currentYear) || this.state.seasons[0];
    if (currentSeason) {
      this.automation.updateLeaderboardFromMatches(currentSeason, this.state.matches, this.state.users);
      this.persist();
      this.hydrateSubjects();
    }
  }

  updateProfile(update: Partial<UserProfile>) {
    const current = this.getCurrentUser();
    if (!current) return;
    const updated: UserProfile = {
      ...current,
      ...update,
      gameIds: {
        ...current.gameIds,
        ...(update.gameIds || {}),
      },
    };
    this.state.users = this.state.users.map((u) => (u.id === current.id ? updated : u));
    this.persist();
    this.hydrateSubjects();
  }

  createStakeMatch(payload: {
    game: string;
    stake: number;
    scheduledAt: string;
    platform: string;
    matchType: string;
    duration: number;
    extraTime: boolean;
    penalties: boolean;
    roomCode?: string;
  }): ArenaActionResult {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in to create a match.' };
    const hasActiveOwnedMatch = this.state.matches.some(
      (match) =>
        match.player1Id === current.id &&
        (match.status === 'waiting' || match.status === 'live' || match.status === 'pending_verification')
    );
    if (hasActiveOwnedMatch) {
      return { ok: false, message: 'You already have an active created match. Complete it before creating another.' };
    }
    if (payload.stake < MATCHMAKING_MINIMUM_STAKE || Number.isNaN(payload.stake)) {
      return { ok: false, message: 'Minimum stake is 1 unit.' };
    }
    if (current.walletBalance < payload.stake) return { ok: false, message: 'Insufficient available balance.' };

    const lockResult = this.lockFunds(current.id, payload.stake, 'stake_lock', `Stake lock for ${payload.game}`);
    if (!lockResult.ok) return lockResult;

    const roomCode = this.normalizeRoomCode(payload.roomCode || this.createRoomCode());
    const roomCodeInUse = this.state.matches.some((item) => item.roomCode === roomCode);
    if (roomCodeInUse) return { ok: false, message: 'Room ID already exists. Generate a new room.' };

    const currentGameId = this.resolveGameId(current, payload.game);
    const match: Match = {
      id: uid(),
      roomCode,
      player1Id: current.id,
      player1GameId: currentGameId,
      game: payload.game,
      platform: payload.platform,
      matchType: payload.matchType,
      duration: payload.duration,
      extraTime: payload.extraTime,
      penalties: payload.penalties,
      stake: payload.stake,
      status: 'waiting',
      scheduledAt: payload.scheduledAt,
      createdAt: now(),
      startedAt: undefined,
      escrowTotal: payload.stake,
      commissionRate: Math.min(MATCHMAKING_PLATFORM_FEE_RATE, Math.max(0.05, this.state.commissionRate || 0.1)),
    };

    this.state.matches.unshift(match);
    this.state.notifications.unshift({
      id: uid(),
      type: 'match',
      message: `Stake match created (${payload.game}) · Room ${roomCode} · $${payload.stake} locked in escrow.`,
      createdAt: now(),
      read: false,
    });
    this.state.spotlightPosts.unshift({
      id: uid(),
      title: `${payload.game} Stake Match Open`,
      body: `${current.username} opened room ${roomCode} (${payload.matchType}) on ${payload.platform} for $${payload.stake}.`,
      tag: 'Community',
      createdAt: now(),
      image: 'assets/FIFA.jpeg',
      likeUserIds: [],
      comments: [],
    });

    this.persist();
    this.hydrateSubjects();
    this.emitMatchRealtimeUpdate(match, 'created');
    this.syncMatchRoomToCloud(match).catch((error) => {
      this.lastRoomSyncIssue = this.getCloudRoomErrorMessage(error);
    });
    return { ok: true, matchId: match.id, roomCode };
  }

  joinStakeMatch(matchId: string): ArenaActionResult {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in to join.' };

    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) return { ok: false, message: 'Match not found.' };
    if (match.status !== 'waiting') return { ok: false, message: 'Match is no longer available to join.' };
    if (match.player1Id === current.id) return { ok: false, message: 'You cannot join your own match.' };
    if (current.walletBalance < match.stake) return { ok: false, message: 'Insufficient available balance.' };

    const lockResult = this.lockFunds(current.id, match.stake, 'stake_lock', `Stake lock for ${match.game}`);
    if (!lockResult.ok) return lockResult;

    match.player2Id = current.id;
    match.player2GameId = this.resolveGameId(current, match.game);
    match.status = 'live';
    match.startedAt = now();
    match.escrowTotal = match.stake * 2;

    const existingChat = this.state.chats.find(
      (chat) => chat.participantIds.includes(match.player1Id) && chat.participantIds.includes(current.id)
    );
    if (!existingChat) {
      this.state.chats.unshift({
        id: uid(),
        participantIds: [match.player1Id, current.id],
        messages: [],
      });
    }

    this.state.notifications.unshift({
      id: uid(),
      type: 'match',
      message: `${current.username} joined room ${match.roomCode || 'N/A'} (${match.game}). Match is now LIVE.`,
      createdAt: now(),
      read: false,
    });

    this.persist();
    this.hydrateSubjects();
    this.emitMatchRealtimeUpdate(match, 'started');
    this.removeCloudRoomByCode(match.roomCode).catch(() => {});
    return { ok: true };
  }

  async joinStakeMatchByRoomCode(roomCode: string): Promise<ArenaActionResult> {
    const normalized = this.normalizeRoomCode(roomCode);
    if (!normalized) return { ok: false, message: 'Enter a valid room ID.' };

    const waitingMatch = this.state.matches.find((item) => item.roomCode === normalized && item.status === 'waiting');
    if (waitingMatch) return this.joinStakeMatch(waitingMatch.id);

    const cloudFetch = await this.fetchCloudMatchRoom(normalized);
    if (!cloudFetch.ok) {
      return { ok: false, message: cloudFetch.message };
    }
    const cloudMatch = cloudFetch.match;
    if (cloudMatch && cloudMatch.status === 'waiting') {
      const existing = this.state.matches.find((item) => item.id === cloudMatch.id);
      if (!existing) {
        this.state.matches.unshift(cloudMatch);
        this.persist();
        this.hydrateSubjects();
      }
      return this.joinStakeMatch(cloudMatch.id);
    }

    const existingMatch = this.state.matches.find((item) => item.roomCode === normalized);
    if (existingMatch) return { ok: false, message: 'Room found, but it is no longer waiting for an opponent.' };
    if (this.lastRoomSyncIssue) {
      return { ok: false, message: `Room not available yet: ${this.lastRoomSyncIssue}` };
    }
    return { ok: false, message: 'Room ID not found.' };
  }

  sendChallenge(toUserId: string, game: string, stake: number, matchTime: string) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in to send a challenge.' };
    if (toUserId === current.id) return { ok: false, message: 'You cannot challenge yourself.' };

    const challenge: Challenge = {
      id: uid(),
      fromUserId: current.id,
      toUserId,
      game,
      stake,
      matchTime,
      status: 'pending',
      createdAt: now(),
    };
    this.state.challenges.unshift(challenge);

    const created = this.createStakeMatch({
      game,
      stake,
      scheduledAt: matchTime,
      platform: 'Cross-platform',
      matchType: '1v1',
      duration: 10,
      extraTime: true,
      penalties: true,
    });
    if (!created.ok) {
      this.state.challenges = this.state.challenges.filter((c) => c.id !== challenge.id);
      this.persist();
      this.hydrateSubjects();
      return created;
    }

    this.state.notifications.unshift({
      id: uid(),
      type: 'challenge',
      message: `Challenge sent to ${this.getUser(toUserId)?.username || 'player'} · ${game} · $${stake}`,
      createdAt: now(),
      read: false,
    });
    this.realtime.invitePlayer({
      fromUserId: current.id,
      toUserId,
      game,
      matchId: created.matchId,
      roomId: created.roomCode,
      message: `${current.username} invited you to a ${game} challenge.`,
      sentAt: now(),
    });

    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  respondToChallenge(id: string, status: 'accepted' | 'declined') {
    const challenge = this.state.challenges.find((c) => c.id === id);
    if (!challenge) return;
    challenge.status = status;

    if (status === 'accepted') {
      const targetMatch = this.state.matches.find(
        (m) =>
          m.status === 'waiting' &&
          m.player1Id === challenge.fromUserId &&
          m.game === challenge.game &&
          m.stake === challenge.stake
      );
      if (targetMatch) {
        const current = this.getCurrentUser();
        if (current?.id === challenge.toUserId) {
          this.joinStakeMatch(targetMatch.id);
        }
      }
    }

    if (status === 'declined') {
      this.state.notifications.unshift({
        id: uid(),
        type: 'challenge',
        message: `Challenge declined for ${challenge.game}.`,
        createdAt: now(),
        read: false,
      });
    }

    this.persist();
    this.hydrateSubjects();
  }

  submitResult(matchId: string, winnerId: string, proofImage: string) {
    const match = this.state.matches.find((m) => m.id === matchId);
    if (!match) return { ok: false, message: 'Match not found.' };
    if (!['live', 'rejected'].includes(match.status)) {
      return { ok: false, message: 'Only LIVE or REJECTED matches can upload results.' };
    }
    if (!match.player2Id) return { ok: false, message: 'Second player has not joined yet.' };
    if (![match.player1Id, match.player2Id].includes(winnerId)) {
      return { ok: false, message: 'Winner must be one of the match players.' };
    }

    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (!this.isMatchParticipant(match, current.id)) {
      return { ok: false, message: 'Only players in this match can upload a screenshot.' };
    }
    if (current.id !== winnerId) {
      return { ok: false, message: 'Only the winning player can submit this screenshot.' };
    }
    const timingStatus = this.getResultTimingStatus(match);
    if (!timingStatus.ready) {
      return {
        ok: false,
        message: `Result upload opens after match time ends. Time left: ${this.formatClock(timingStatus.remainingSeconds)}.`,
      };
    }

    match.status = 'pending_verification';
    match.winnerId = winnerId;
    match.screenshotUrl = proofImage;
    match.uploadedAt = now();
    match.verifiedAt = undefined;
    match.adminId = undefined;
    match.verificationNote = undefined;

    const prize = Math.round(match.escrowTotal * 100) / 100;
    match.prize = prize;
    this.state.notifications.unshift({
      id: uid(),
      type: 'match',
      message: `Result uploaded for ${match.game}. Match is pending verification.`,
      createdAt: now(),
      read: false,
    });

    this.persist();
    this.hydrateSubjects();
    this.emitMatchRealtimeUpdate(match, 'result_submitted', winnerId);
    return { ok: true };
  }

  uploadMatchScreenshot(matchId: string, payload: { winnerId: string; fileName: string; mimeType: string; size: number; dataUrl: string }) {
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(payload.mimeType)) {
      return { ok: false, message: 'Only PNG or JPG screenshots are allowed.' };
    }
    if (payload.size > 5 * 1024 * 1024) {
      return { ok: false, message: 'Screenshot must be 5MB or less.' };
    }
    const result = this.submitResult(matchId, payload.winnerId, payload.dataUrl);
    if (!result.ok) return result;

    const match = this.state.matches.find((item) => item.id === matchId);
    if (match) {
      match.screenshotFileName = payload.fileName;
      match.screenshotMimeType = payload.mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
    }
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  autoVerifyPendingMatch(matchId: string, note = 'Platform auto-verification complete.') {
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) return { ok: false, message: 'Match not found.' };
    if (match.status !== 'pending_verification') return { ok: false, message: 'Match is not pending verification.' };
    if (!match.player2Id || !match.winnerId) return { ok: false, message: 'Incomplete match data.' };

    match.adminId = 'platform-auto';
    match.verifiedAt = now();
    match.verificationNote = note.trim() || 'Platform auto-verification complete.';

    const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
    const commission = Math.round(match.escrowTotal * match.commissionRate * 100) / 100;
    const prizePaid = Math.round((match.escrowTotal - commission) * 100) / 100;

    this.unlockFunds(match.player1Id, match.stake);
    this.unlockFunds(match.player2Id, match.stake);
    this.adjustAvailableBalance(match.winnerId, prizePaid);

    this.state.users = this.state.users.map((u) => {
      if (u.id === match.winnerId) return { ...u, wins: u.wins + 1 };
      if (u.id === loserId) return { ...u, losses: u.losses + 1 };
      return u;
    });

    match.status = 'verified';
    match.prizePaid = prizePaid;

    this.state.transactions.unshift({
      id: uid(),
      type: 'reward',
      amount: prizePaid,
      createdAt: now(),
      status: 'completed',
      note: `Auto-verified payout (${match.game})`,
    });

    this.state.notifications.unshift({
      id: uid(),
      type: 'payment',
      message: `Match auto-verified. Winner credited $${prizePaid}.`,
      createdAt: now(),
      read: false,
    });

    this.state.spotlightPosts.unshift({
      id: uid(),
      title: `${match.game} Match Verified`,
      body: `${this.getUser(match.winnerId)?.username || 'Winner'} paid $${prizePaid} after auto-verification.`,
      tag: 'Result',
      createdAt: now(),
      image: match.screenshotUrl,
      likeUserIds: [],
      comments: [],
    });

    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  reviewPendingMatch(matchId: string, decision: 'approved' | 'rejected', note = '') {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (!current.isAdmin) return { ok: false, message: 'Only admins can verify screenshots.' };

    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) return { ok: false, message: 'Match not found.' };
    if (match.status !== 'pending_verification') return { ok: false, message: 'Match is not pending verification.' };
    if (!match.player2Id || !match.winnerId) return { ok: false, message: 'Incomplete match data.' };

    match.adminId = current.id;
    match.verifiedAt = now();
    match.verificationNote = note.trim() || undefined;

    if (decision === 'rejected') {
      match.status = 'rejected';
      this.state.notifications.unshift({
        id: uid(),
        type: 'match',
        message: `Screenshot rejected for ${match.game}. Re-upload required.`,
        createdAt: now(),
        read: false,
      });
      this.persist();
      this.hydrateSubjects();
      return { ok: true };
    }

    const loserId = match.player1Id === match.winnerId ? match.player2Id : match.player1Id;
    const commission = Math.round(match.escrowTotal * match.commissionRate * 100) / 100;
    const prizePaid = Math.round((match.escrowTotal - commission) * 100) / 100;

    this.unlockFunds(match.player1Id, match.stake);
    this.unlockFunds(match.player2Id, match.stake);
    this.adjustAvailableBalance(match.winnerId, prizePaid);

    this.state.users = this.state.users.map((u) => {
      if (u.id === match.winnerId) return { ...u, wins: u.wins + 1 };
      if (u.id === loserId) return { ...u, losses: u.losses + 1 };
      return u;
    });

    match.status = 'verified';
    match.prizePaid = prizePaid;

    this.state.transactions.unshift({
      id: uid(),
      type: 'reward',
      amount: prizePaid,
      createdAt: now(),
      status: 'completed',
      note: `Verified payout (${match.game})`,
    });

    this.state.notifications.unshift({
      id: uid(),
      type: 'payment',
      message: `Screenshot approved. Winner credited $${prizePaid}.`,
      createdAt: now(),
      read: false,
    });

    this.state.spotlightPosts.unshift({
      id: uid(),
      title: `${match.game} Match Verified`,
      body: `${this.getUser(match.winnerId)?.username || 'Winner'} paid $${prizePaid} after verification.`,
      tag: 'Result',
      createdAt: now(),
      image: match.screenshotUrl,
      likeUserIds: [],
      comments: [],
    });

    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  getPendingVerificationMatches() {
    return this.state.matches.filter((match) => match.status === 'pending_verification');
  }

  joinTournament(tournamentId: string, paymentCurrency: 'NGN' | 'USD' = 'USD'): ArenaActionResult {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in to join.', redirectTo: '/auth/login' };

    const tournament = this.state.tournaments.find((item) => item.id === tournamentId);
    if (!tournament) return { ok: false, message: 'Tournament not found.' };
    this.applyTierPricing(tournament);
    if (!this.isTournamentOpenForRegistration(tournament)) {
      return { ok: false, message: 'Tournament registration is closed.' };
    }
    if (tournament.participants.includes(current.id)) return { ok: false, message: 'You already joined this tournament.' };
    if (tournament.participants.length >= tournament.maxPlayers) return { ok: false, message: 'Tournament is full.' };
    const requiredEntryFee = paymentCurrency === 'NGN' ? tournament.entryFeeNGN || 0 : tournament.entryFeeUSD || 0;
    if (requiredEntryFee <= 0) return { ok: false, message: 'Tournament entry fee is not configured.' };
    if (current.walletBalance < requiredEntryFee) {
      return { ok: false, message: 'Insufficient wallet balance.', needsDeposit: true };
    }

    const paymentRef = this.createPaystackReference('TOUR');
    const paymentResult = this.verifyPaystackPayment({
      referenceId: paymentRef,
      expectedAmount: requiredEntryFee,
      currency: paymentCurrency,
      context: `Tournament entry fee: ${tournament.title}`,
      userId: current.id,
    });
    if (!paymentResult.ok) return paymentResult;

    const createdAt = now();
    const lockResult = this.lockFunds(
      current.id,
      requiredEntryFee,
      'tournament_entry_fee',
      `Tournament entry fee (${paymentCurrency}): ${tournament.title}`,
      { transactionId: paymentResult.transactionId || uid(), createdAt }
    );
    if (!lockResult.ok) return lockResult;

    tournament.participants.push(current.id);
    tournament.paymentCurrency = paymentCurrency;
    tournament.entries = [
      {
        id: uid(),
        tournamentId: tournament.id,
        userId: current.id,
        username: current.username,
        joinedAt: createdAt,
        status: 'registered',
      },
      ...(tournament.entries || []),
    ];
    this.recalculateTournamentPool(tournament);
    if (tournament.participants.length >= tournament.maxPlayers) {
      tournament.status = 'ready';
      tournament.bracket = this.generateTournamentBracket(tournament);
      this.emitTournamentRealtimeUpdate(
        tournament,
        'bracket_updated',
        `${tournament.title}: bracket generated with ${tournament.participants.length} players.`
      );
    } else if (tournament.status === 'upcoming') {
      tournament.status = 'open';
    }

    this.state.notifications.unshift({
      id: uid(),
      type: 'tournament',
      message: `Joined tournament: ${tournament.title}`,
      createdAt,
      read: false,
    });

    this.state.notifications.unshift({
      id: uid(),
      type: 'tournament',
      message: `Reminder set: ${tournament.title} starts ${tournament.startsAt}`,
      createdAt,
      read: false,
    });

    this.state.spotlightPosts.unshift({
      id: uid(),
      title: `${tournament.title} Player List Updated`,
      body: `${tournament.participants.length}/${tournament.maxPlayers} players registered.`,
      tag: 'Announcement',
      createdAt: now(),
      image: tournament.image,
      likeUserIds: [],
      comments: [],
    });

    this.persist();
    this.hydrateSubjects();
    this.emitTournamentRealtimeUpdate(
      tournament,
      'player_joined',
      `${tournament.title}: registration updated (${tournament.participants.length}/${tournament.maxPlayers}).`
    );

    return { ok: true, transactionId: paymentResult.transactionId || lockResult.transactionId, transactionAt: lockResult.createdAt };
  }

  completeTournament(tournamentId: string, forcedWinnerId?: string) {
    const tournament = this.state.tournaments.find((item) => item.id === tournamentId);
    if (!tournament) return { ok: false, message: 'Tournament not found.' };
    if (!tournament.participants.length) return { ok: false, message: 'No participants registered.' };

    const winnerId =
      forcedWinnerId && tournament.participants.includes(forcedWinnerId)
        ? forcedWinnerId
        : tournament.participants[Math.floor(Math.random() * tournament.participants.length)];

    this.recalculateTournamentPool(tournament);

    const participantEntryAmount =
      (tournament.paymentCurrency || 'USD') === 'NGN' ? tournament.entryFeeNGN || 0 : tournament.entryFeeUSD || 0;
    for (const participantId of tournament.participants) {
      this.unlockFunds(participantId, participantEntryAmount);
    }

    const prizePool = tournament.prizePool;
    const firstPlace = Math.round(prizePool * 0.6 * 100) / 100;
    const secondPlace = Math.round(prizePool * 0.25 * 100) / 100;
    const thirdPlace = Math.round(prizePool * 0.15 * 100) / 100;
    tournament.payoutBreakdown = { first: firstPlace, second: secondPlace, third: thirdPlace };
    this.adjustAvailableBalance(winnerId, firstPlace);

    tournament.status = 'ended';
    tournament.winnerId = winnerId;

    this.state.transactions.unshift({
      id: uid(),
      type: 'reward',
      amount: firstPlace,
      createdAt: now(),
      status: 'completed',
      note: `Tournament payout (1st place): ${tournament.title}`,
    });

    this.state.spotlightPosts.unshift({
      id: uid(),
      title: `${tournament.title} Champion`,
      body: `${this.getUser(winnerId)?.username || 'A player'} won ${tournament.game} and earned ${firstPlace} (${(tournament.paymentCurrency || 'USD')}).`,
      tag: 'Result',
      createdAt: now(),
      image: tournament.image,
      likeUserIds: [],
      comments: [],
    });

    this.state.notifications.unshift({
      id: uid(),
      type: 'tournament',
      message: `${tournament.title} ended. Winner has been paid automatically.`,
      createdAt: now(),
      read: false,
    });

    this.persist();
    this.hydrateSubjects();
    this.emitTournamentRealtimeUpdate(tournament, 'tournament_completed', `${tournament.title} has been completed.`);
    return { ok: true };
  }

  toggleSpotlightLike(postId: string) {
    const current = this.getCurrentUser();
    if (!current) return;
    this.state.spotlightPosts = this.state.spotlightPosts.map((post) => {
      if (post.id !== postId) return post;
      const hasLiked = post.likeUserIds.includes(current.id);
      return {
        ...post,
        likeUserIds: hasLiked
          ? post.likeUserIds.filter((id) => id !== current.id)
          : [...post.likeUserIds, current.id],
      };
    });
    this.persist();
    this.hydrateSubjects();
  }

  addSpotlightComment(postId: string, text: string) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (!text.trim()) return { ok: false, message: 'Comment cannot be empty.' };

    this.state.spotlightPosts = this.state.spotlightPosts.map((post) =>
      post.id === postId
        ? {
            ...post,
            comments: [
              {
                id: uid(),
                userId: current.id,
                text: text.trim(),
                createdAt: now(),
                reactionUserIds: [],
              },
              ...post.comments,
            ],
          }
        : post
    );
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  toggleSpotlightCommentReaction(postId: string, commentId: string) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };

    this.state.spotlightPosts = this.state.spotlightPosts.map((post) => {
      if (post.id !== postId) return post;
      return {
        ...post,
        comments: post.comments.map((comment) => {
          if (comment.id !== commentId) return comment;
          const reacted = (comment.reactionUserIds || []).includes(current.id);
          return {
            ...comment,
            reactionUserIds: reacted
              ? (comment.reactionUserIds || []).filter((id) => id !== current.id)
              : [...(comment.reactionUserIds || []), current.id],
          };
        }),
      };
    });
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  deleteSpotlightComment(postId: string, commentId: string) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };

    let deleted = false;
    this.state.spotlightPosts = this.state.spotlightPosts.map((post) => {
      if (post.id !== postId) return post;
      const target = post.comments.find((comment) => comment.id === commentId);
      if (!target || target.userId !== current.id) return post;
      deleted = true;
      return {
        ...post,
        comments: post.comments.filter((comment) => comment.id !== commentId),
      };
    });

    if (!deleted) return { ok: false, message: 'You can only delete your own comment.' };
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  sendFriendRequest(toUserId: string) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (toUserId === current.id) return { ok: false, message: 'You cannot add yourself.' };
    if (!this.getUser(toUserId)) return { ok: false, message: 'Player not found.' };

    const existing = this.state.friendRequests.find(
      (item) =>
        ((item.fromUserId === current.id && item.toUserId === toUserId) ||
          (item.fromUserId === toUserId && item.toUserId === current.id)) &&
        item.status !== 'declined'
    );
    if (existing?.status === 'accepted') {
      return { ok: false, message: 'You are already friends.' };
    }
    if (existing?.status === 'pending') {
      return { ok: false, message: 'A pending request already exists.' };
    }

    this.state.friendRequests.unshift({
      id: uid(),
      fromUserId: current.id,
      toUserId,
      status: 'pending',
      createdAt: now(),
    });
    this.state.notifications.unshift({
      id: uid(),
      type: 'friend',
      userId: toUserId,
      message: `${current.username} sent you a friend request.`,
      createdAt: now(),
      read: false,
    });
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  respondToFriendRequest(requestId: string, status: 'accepted' | 'declined') {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    const request = this.state.friendRequests.find((item) => item.id === requestId);
    if (!request) return { ok: false, message: 'Request not found.' };
    if (request.toUserId !== current.id) return { ok: false, message: 'You cannot respond to this request.' };
    if (request.status !== 'pending') return { ok: false, message: 'Request already handled.' };

    request.status = status;
    request.respondedAt = now();
    const fromUser = this.getUser(request.fromUserId);
    this.state.notifications.unshift({
      id: uid(),
      type: 'friend',
      userId: current.id,
      message: `You ${status} ${fromUser?.username || 'player'}'s friend request.`,
      createdAt: now(),
      read: false,
    });
    if (status === 'accepted') {
      this.state.notifications.unshift({
        id: uid(),
        type: 'friend',
        userId: request.fromUserId,
        message: `${current.username} accepted your friend request.`,
        createdAt: now(),
        read: false,
      });
      this.createChatWith(request.fromUserId);
    }

    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  getCurrentUserFriendRequests() {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId) return [];
    return this.state.friendRequests.filter(
      (request) => request.toUserId === currentUserId && request.status === 'pending'
    );
  }

  getFriendshipState(userId: string): 'none' | 'pending_in' | 'pending_out' | 'friends' {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId || currentUserId === userId) return 'none';
    const request = this.state.friendRequests.find(
      (item) =>
        (item.fromUserId === currentUserId && item.toUserId === userId) ||
        (item.fromUserId === userId && item.toUserId === currentUserId)
    );
    if (!request) return 'none';
    if (request.status === 'accepted') return 'friends';
    if (request.status === 'pending') return request.toUserId === currentUserId ? 'pending_in' : 'pending_out';
    return 'none';
  }

  createChatWith(userId: string) {
    const current = this.getCurrentUser();
    if (!current) return '';
    if (userId === current.id) return '';
    if (!this.getUser(userId)) return '';
    const existing = this.state.chats.find(
      (c) => c.participantIds.includes(userId) && c.participantIds.includes(current.id)
    );
    if (existing) return existing.id;
    const chatId = uid();
    this.state.chats.unshift({
      id: chatId,
      participantIds: [current.id, userId],
      messages: [],
    });
    this.realtime.joinRoom({
      roomId: chatId,
      roomType: 'private',
      userId: current.id,
    });
    this.persist();
    this.hydrateSubjects();
    return chatId;
  }

  joinTournamentGroupChat(tournamentId: string): ArenaActionResult {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    const tournament = this.state.tournaments.find((item) => item.id === tournamentId);
    if (!tournament) return { ok: false, message: 'Tournament not found.' };
    if (!tournament.participants.includes(current.id)) {
      return { ok: false, message: 'Join the tournament first before entering group chat.' };
    }

    const chatId = this.getTournamentGroupChatId(tournament.id);
    let chat = this.state.chats.find((item) => item.id === chatId);

    if (!chat) {
      chat = {
        id: chatId,
        participantIds: [...new Set(tournament.participants)],
        messages: [],
      };
      this.state.chats.unshift(chat);
    } else {
      const wasMember = chat.participantIds.includes(current.id);
      chat.participantIds = [...new Set([...chat.participantIds, ...tournament.participants, current.id])];
      if (!wasMember) {
        chat.messages.push({
          id: uid(),
          senderId: current.id,
          text: `${current.username} joined the tournament group chat.`,
          sentAt: now(),
          status: 'delivered',
        });
      }
    }

    this.persist();
    this.hydrateSubjects();
    this.realtime.joinRoom({
      roomId: chatId,
      roomType: 'team',
      userId: current.id,
    });
    return { ok: true, message: 'Tournament group chat joined.', redirectTo: `/chat/${chatId}` };
  }

  getTournamentGroupChatForCurrentUser(tournamentId: string) {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId) return undefined;
    const chatId = this.getTournamentGroupChatId(tournamentId);
    return this.state.chats.find((chat) => chat.id === chatId && chat.participantIds.includes(currentUserId));
  }

  sendMessage(chatId: string, message: { text?: string; image?: string; replyToId?: string }) {
    const current = this.getCurrentUser();
    if (!current) return;
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    if (!chat.participantIds.includes(current.id)) return;
    const text = (message.text || '').trim();
    if (!text && !message.image) return;
    const newMessage = {
      id: uid(),
      senderId: current.id,
      text,
      image: message.image,
      sentAt: now(),
      status: 'sent' as const,
      replyToId: message.replyToId,
    };
    chat.messages.push(newMessage);
    for (const participantId of chat.participantIds) {
      if (participantId === current.id) continue;
      this.pushIncomingChatNotification(chat.id, current.id, text || 'Sent you a message.', participantId);
    }
    setTimeout(() => this.markDelivered(chatId, newMessage.id), 400);
    const roomType = chatId.startsWith('tournament-chat-') ? 'team' : chat.participantIds.length > 2 ? 'lobby' : 'private';
    const payload: SendMessagePayload = {
      chatId,
      roomId: chatId,
      senderId: current.id,
      text,
      image: message.image,
      replyToId: message.replyToId,
      sentAt: newMessage.sentAt,
      messageId: newMessage.id,
      scope: roomType === 'team' ? 'team' : roomType === 'private' ? 'private' : 'room',
      recipientUserId: roomType === 'private' ? chat.participantIds.find((id) => id !== current.id) : undefined,
    };
    if (roomType === 'team') {
      this.realtime.sendTeamMessage(payload);
    } else if (roomType === 'private') {
      this.realtime.sendPrivateMessage(payload);
    } else {
      this.realtime.sendMessage(payload);
    }
    this.persist();
    this.hydrateSubjects();
    return newMessage.id;
  }

  deleteMessage(chatId: string, messageId: string) {
    const current = this.getCurrentUser();
    if (!current) return;
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const message = chat.messages.find((m) => m.id === messageId);
    if (!message) return;
    if (message.senderId !== current.id) return; // only allow author to delete
    chat.messages = chat.messages.filter((m) => m.id !== messageId);
    this.persist();
    this.hydrateSubjects();
  }

  reactToMessage(chatId: string, messageId: string, reaction: string) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const message = chat.messages.find((m) => m.id === messageId);
    if (!message) return;
    message.reaction = message.reaction === reaction ? undefined : reaction;
    this.persist();
    this.hydrateSubjects();
  }

  markDelivered(chatId: string, messageId: string) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const msg = chat.messages.find((m) => m.id === messageId);
    if (!msg || msg.status === 'seen') return;
    msg.status = 'delivered';
    this.persist();
    this.hydrateSubjects();
  }

  markSeen(chatId: string, messageId: string) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const msg = chat.messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.status = 'seen';
    this.persist();
    this.hydrateSubjects();
  }

  markAllUserMessagesSeen(chatId: string, recipientId: string) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    let updated = false;
    for (const msg of chat.messages) {
      if (msg.senderId === recipientId && msg.status !== 'seen') {
        msg.status = 'seen';
        updated = true;
      }
    }
    if (updated) {
      this.persist();
      this.hydrateSubjects();
    }
  }

  deposit(input: { amount: number; currency: Currency; method: string }) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    const { amount, currency, method } = input;
    if (!amount || Number.isNaN(amount) || amount <= 0) return { ok: false, message: 'Enter a valid deposit amount.' };
    if (amount < 100) return { ok: false, message: 'Minimum deposit is 100 units.' };
    if (amount > 500_000) return { ok: false, message: 'Maximum deposit is 500,000 units.' };

    const referenceId = `DEP-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    const transaction: TransactionItem = {
      id: uid(),
      type: 'deposit',
      amount,
      currency,
      method,
      referenceId,
      createdAt: now(),
      status: 'pending',
      details: `Deposit via ${method}`,
    };
    this.state.transactions.unshift(transaction);
    this.adjustAvailableBalance(current.id, amount);
    transaction.status = 'completed';
    this.persist();
    this.hydrateSubjects();
    return { ok: true, referenceId, status: transaction.status };
  }

  withdraw(input: { amount: number; currency: Currency; method: string; destination: string }) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    const { amount, currency, method, destination } = input;
    if (!amount || Number.isNaN(amount) || amount <= 0) return { ok: false, message: 'Enter a valid withdrawal amount.' };
    if (amount < 500) return { ok: false, message: 'Minimum withdrawal is 500 units.' };
    if (amount > 200_000) return { ok: false, message: 'Maximum withdrawal per request is 200,000 units.' };
    if (amount > current.walletBalance) return { ok: false, message: 'Insufficient available balance for this withdrawal.' };

    const referenceId = `WDR-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    const transaction: TransactionItem = {
      id: uid(),
      type: 'withdraw',
      amount,
      currency,
      method,
      referenceId,
      createdAt: now(),
      status: 'pending',
      details: `Payout to ${destination}`,
    };
    this.state.transactions.unshift(transaction);
    this.adjustAvailableBalance(current.id, -amount);
    transaction.status = 'processed';
    this.persist();
    this.hydrateSubjects();
    return { ok: true, referenceId, status: transaction.status };
  }

  markNotificationRead(id: string) {
    const currentUserId = this.state.currentUserId;
    this.state.notifications = this.state.notifications.map((n) => {
      if (n.id !== id) return n;
      if (n.userId && currentUserId && n.userId !== currentUserId) return n;
      return { ...n, read: true };
    });
    this.persist();
    this.hydrateSubjects();
  }

  getUser(id: string) {
    return this.state.users.find((u) => u.id === id);
  }

  findUserByGameId(gameId: string) {
    const normalized = gameId.trim().toLowerCase();
    if (!normalized) return undefined;
    const currentUserId = this.state.currentUserId;
    return this.state.users.find((user) => {
      if (user.id === currentUserId) return false;
      if (user.gameId.toLowerCase() === normalized) return true;
      return Object.values(user.gameIds).some((id) => id.toLowerCase() === normalized);
    });
  }

  getCurrentUser() {
    return this.state.users.find((u) => u.id === this.state.currentUserId) || null;
  }

  getChatForCurrentUser(chatId: string) {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId) return undefined;
    const chat = this.state.chats.find((item) => item.id === chatId && item.participantIds.includes(currentUserId));
    if (chat) {
      this.realtime.joinRoom({
        roomId: chat.id,
        roomType: chat.id.startsWith('tournament-chat-') ? 'team' : chat.participantIds.length > 2 ? 'lobby' : 'private',
        userId: currentUserId,
      });
    }
    return chat;
  }

  getGlobalRank(userId: string) {
    const ranked = [...this.state.users].sort((a, b) => this.getRankPoints(b) - this.getRankPoints(a));
    const index = ranked.findIndex((user) => user.id === userId);
    return index >= 0 ? index + 1 : ranked.length;
  }

  getAvailableMatches(game?: string) {
    return this.state.matches.filter((match) => match.status === 'waiting' && (!game || match.game === game));
  }

  runAiVerificationPreview(matchId: string) {
    const match = this.state.matches.find((item) => item.id === matchId);
    if (!match) return { ok: false, message: 'Match not found.' };
    if (!match.screenshotUrl) return { ok: false, message: 'No screenshot uploaded yet.' };

    // Placeholder for a future AI pipeline (Vision/OCR/OpenCV).
    const confidence = 0.82;
    const decision = confidence >= 0.75 ? 'verified' : 'rejected';
    return { ok: true, decision, confidence };
  }

  private bindRealtimeEvents() {
    this.realtime.message$.subscribe((payload) => {
      this.applyIncomingRealtimeMessage(payload);
    });

    this.realtime.matchUpdate$.subscribe((payload) => {
      this.applyIncomingMatchUpdate(payload);
    });

    this.realtime.invite$.subscribe((payload) => {
      this.applyIncomingInvite(payload);
    });

    this.realtime.tournamentUpdate$.subscribe((payload) => {
      this.applyIncomingTournamentUpdate(payload);
    });

    this.realtime.notification$.subscribe((payload) => {
      const currentUserId = this.state.currentUserId;
      if (payload.userId && payload.userId !== currentUserId) return;
      this.state.notifications.unshift({
        id: payload.id,
        type: payload.type === 'invite' ? 'friend' : payload.type === 'match' ? 'match' : 'system',
        message: payload.message,
        createdAt: payload.createdAt,
        read: false,
        userId: payload.userId,
      });
      this.persist();
      this.hydrateSubjects();
    });
  }

  private applyIncomingRealtimeMessage(payload: SendMessagePayload) {
    const current = this.getCurrentUser();
    if (!current) return;
    if (payload.senderId === current.id) return;

    let chat = this.state.chats.find((item) => item.id === payload.chatId);
    if (!chat) {
      chat = {
        id: payload.chatId,
        participantIds: [payload.senderId, current.id],
        messages: [],
      };
      this.state.chats.unshift(chat);
    }

    if (!chat.participantIds.includes(current.id)) {
      chat.participantIds = [...new Set([...chat.participantIds, current.id])];
    }
    if (!chat.participantIds.includes(payload.senderId)) {
      chat.participantIds = [...new Set([...chat.participantIds, payload.senderId])];
    }

    if (chat.messages.some((item) => item.id === payload.messageId)) return;

    chat.messages.push({
      id: payload.messageId,
      senderId: payload.senderId,
      text: payload.text,
      image: payload.image,
      sentAt: payload.sentAt,
      status: 'delivered',
      replyToId: payload.replyToId,
    });

    this.pushIncomingChatNotification(payload.chatId, payload.senderId, payload.text || 'Sent you a message.', current.id);
    this.persist();
    this.hydrateSubjects();
  }

  private applyIncomingMatchUpdate(payload: MatchUpdatePayload) {
    let match = this.state.matches.find((item) => item.id === payload.matchId);
    if (!match && payload.action === 'created') {
      const roomCode = (payload.roomCode || '').trim().toUpperCase();
      if (!roomCode || !payload.game || typeof payload.stake !== 'number') return;
      match = {
        id: payload.matchId,
        roomCode,
        player1Id: payload.actorUserId,
        player1GameId: 'N/A',
        game: payload.game,
        platform: payload.platform || 'Cross-platform',
        matchType: payload.matchType || '1v1',
        duration: typeof payload.duration === 'number' ? payload.duration : 10,
        extraTime: typeof payload.extraTime === 'boolean' ? payload.extraTime : true,
        penalties: typeof payload.penalties === 'boolean' ? payload.penalties : true,
        stake: payload.stake,
        status: (payload.status as Match['status']) || 'waiting',
        scheduledAt: payload.scheduledAt || 'Upcoming',
        createdAt: payload.timestamp || now(),
        escrowTotal: payload.stake,
        commissionRate: Math.min(MATCHMAKING_PLATFORM_FEE_RATE, Math.max(0.05, this.state.commissionRate || 0.1)),
      };
      this.state.matches.unshift(match);
    }
    if (!match) return;
    if (payload.status) match.status = payload.status as Match['status'];
    if (payload.winnerId) match.winnerId = payload.winnerId;
    if (payload.roomCode) match.roomCode = payload.roomCode.trim().toUpperCase();
    this.persist();
    this.hydrateSubjects();
  }

  private applyIncomingInvite(payload: InvitePlayerPayload) {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId || payload.toUserId !== currentUserId) return;
    this.state.notifications.unshift({
      id: uid(),
      type: 'friend',
      message: payload.message,
      createdAt: payload.sentAt,
      read: false,
      userId: payload.toUserId,
    });
    this.persist();
    this.hydrateSubjects();
  }

  private applyIncomingTournamentUpdate(payload: TournamentUpdatePayload) {
    const tournament = this.state.tournaments.find((item) => item.id === payload.tournamentId);
    if (!tournament) return;
    if (payload.lifecycleState) {
      tournament.lifecycleState = payload.lifecycleState;
      if (payload.lifecycleState === 'live') tournament.status = 'live';
      if (payload.lifecycleState === 'completed') tournament.status = 'ended';
      if (payload.lifecycleState === 'registration_open') tournament.status = 'open';
      if (payload.lifecycleState === 'registration_closed') tournament.status = 'closed';
      if (payload.lifecycleState === 'upcoming') tournament.status = 'upcoming';
    }
    if (payload.message) {
      this.state.notifications.unshift({
        id: uid(),
        type: 'tournament',
        message: payload.message,
        createdAt: payload.timestamp,
        read: false,
      });
    }
    this.persist();
    this.hydrateSubjects();
  }

  private emitMatchRealtimeUpdate(
    match: Match,
    action: MatchUpdatePayload['action'],
    winnerId?: string
  ) {
    const current = this.getCurrentUser();
    if (!current) return;
    this.realtime.joinRoom({
      roomId: match.id,
      roomType: 'match',
      userId: current.id,
    });
    this.realtime.sendMatchUpdate({
      matchId: match.id,
      roomId: match.id,
      action,
      actorUserId: current.id,
      status: match.status,
      winnerId,
      roomCode: match.roomCode,
      game: match.game,
      stake: match.stake,
      scheduledAt: match.scheduledAt,
      platform: match.platform,
      matchType: match.matchType,
      duration: match.duration,
      extraTime: match.extraTime,
      penalties: match.penalties,
      timestamp: now(),
    });
  }

  private emitTournamentRealtimeUpdate(
    tournament: Tournament,
    action: TournamentUpdatePayload['action'],
    message?: string
  ) {
    this.realtime.sendTournamentUpdate({
      tournamentId: tournament.id,
      action,
      lifecycleState: this.resolveLifecycleState(tournament),
      message,
      timestamp: now(),
    });
  }

  private hydrateSubjects() {
    this.applyTournamentLifecycleStates();
    this.users$.next(this.state.users);
    this.currentUser$.next(this.getCurrentUser());
    this.friendRequests$.next(this.getCurrentUserFriendRequests());
    this.challenges$.next(this.state.challenges);
    this.matches$.next(this.state.matches);
    this.tournaments$.next(this.state.tournaments);
    this.spotlightPosts$.next(this.state.spotlightPosts);
    this.chats$.next(this.getChatsForCurrentUser());
    this.notifications$.next(this.getNotificationsForCurrentUser());
    this.transactions$.next(this.state.transactions);
    this.seasons$.next(this.state.seasons);
  }

  private getChatsForCurrentUser() {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId) return [] as ChatThread[];
    return this.state.chats.filter((chat) => chat.participantIds.includes(currentUserId));
  }

  private getRankPoints(user: UserProfile) {
    return Math.max(0, user.wins * 30 - user.losses * 8);
  }

  private pushIncomingChatNotification(chatId: string, senderId: string, messageText: string, recipientUserId: string) {
    if (senderId === recipientUserId) return;
    const sender = this.getUser(senderId);
    const preview = messageText.trim() || 'Sent you a message.';

    this.state.notifications.unshift({
      id: uid(),
      type: 'chat',
      chatId,
      userId: recipientUserId,
      message: `${sender?.username || 'Player'}: ${preview}`,
      createdAt: now(),
      read: false,
    });
  }

  private getNotificationsForCurrentUser() {
    const currentUserId = this.state.currentUserId;
    if (!currentUserId) return [];
    return this.state.notifications.filter((note) => !note.userId || note.userId === currentUserId);
  }

  private getTournamentGroupChatId(tournamentId: string) {
    return `tournament-chat-${tournamentId}`;
  }

  private resolveLifecycleState(tournament: Tournament): TournamentLifecycleState {
    const nowMs = Date.now();
    const registrationOpenMs = Date.parse(tournament.registrationOpenAt || '');
    const registrationCloseMs = Date.parse(tournament.registrationCloseAt || '');
    const startMs = Date.parse(tournament.startsAt || '');
    const endMs = Date.parse(tournament.endsAt || '');

    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      if (tournament.status === 'live') return 'live';
      if (tournament.status === 'ended') return 'completed';
      if (tournament.status === 'closed') return 'registration_closed';
      return 'upcoming';
    }
    if (nowMs < registrationOpenMs) return 'upcoming';
    if (nowMs >= registrationOpenMs && nowMs <= registrationCloseMs) return 'registration_open';
    if (nowMs > registrationCloseMs && nowMs < startMs) return 'registration_closed';
    if (nowMs >= startMs && nowMs <= endMs) return 'live';
    return 'completed';
  }

  private applyTournamentLifecycleStates() {
    for (const tournament of this.state.tournaments) {
      const lifecycle = this.resolveLifecycleState(tournament);
      tournament.lifecycleState = lifecycle;
      if (lifecycle === 'registration_open') tournament.status = 'open';
      if (lifecycle === 'registration_closed') tournament.status = 'closed';
      if (lifecycle === 'live') tournament.status = 'live';
      if (lifecycle === 'completed') tournament.status = 'ended';
      if (lifecycle === 'upcoming') tournament.status = 'upcoming';
    }
  }

  private isTournamentOpenForRegistration(tournament: Tournament) {
    const lifecycle = tournament.lifecycleState || this.resolveLifecycleState(tournament);
    return lifecycle === 'registration_open';
  }

  private generateTournamentBracket(tournament: Tournament): TournamentBracket {
    const participants = [...tournament.participants];
    const totalPlayers = participants.length;
    const rounds: TournamentBracketRound[] = [];
    let roundSize = totalPlayers;

    const roundNameForSize = (size: number) => {
      if (size === 2) return 'Final';
      if (size === 4) return 'Semifinals';
      if (size === 8) return 'Quarterfinals';
      return `Round of ${size}`;
    };

    while (roundSize >= 2) {
      const matchCount = Math.ceil(roundSize / 2);
      const matches: TournamentBracketMatch[] = Array.from({ length: matchCount }, (_, index) => {
        const player1Id = roundSize === totalPlayers ? participants[index * 2] : undefined;
        const player2Id = roundSize === totalPlayers ? participants[index * 2 + 1] : undefined;
        const ready = Boolean(player1Id && player2Id);
        return {
          id: uid(),
          player1Id,
          player2Id,
          status: ready ? 'ready' : 'pending',
        };
      });

      rounds.push({
        id: uid(),
        name: roundNameForSize(roundSize),
        matches,
      });

      roundSize = Math.floor(roundSize / 2);
    }

    return { generatedAt: now(), rounds };
  }

  private getTournamentTier(title: string): TournamentTier {
    const normalized = title.toLowerCase();
    if (normalized.includes('rising stars cup')) return 'LOW';
    if (normalized.includes('winter cup') || normalized.includes('knockout masters')) return 'STANDARD';
    if (
      normalized.includes('champions showcase') ||
      normalized.includes('all-star arena') ||
      normalized.includes('season honors clash')
    ) {
      return 'PREMIUM';
    }
    return 'STANDARD';
  }

  private getTierFees(tier: TournamentTier) {
    if (tier === 'LOW') return { ngn: 500, usd: 1 };
    if (tier === 'PREMIUM') return { ngn: 2000, usd: 2 };
    return { ngn: 1000, usd: 1 };
  }

  private applyTierPricing(tournament: Tournament) {
    tournament.tier = this.getTournamentTier(tournament.title);
    const fee = this.getTierFees(tournament.tier);
    tournament.entryFeeNGN = fee.ngn;
    tournament.entryFeeUSD = fee.usd;
    tournament.platformFeePercent = TOURNAMENT_PLATFORM_FEE_PERCENT;
    tournament.entryFee = (tournament.paymentCurrency || 'USD') === 'NGN' ? fee.ngn : fee.usd;
    this.recalculateTournamentPool(tournament);
  }

  private recalculateTournamentPool(tournament: Tournament) {
    const entryFee = (tournament.paymentCurrency || 'USD') === 'NGN' ? tournament.entryFeeNGN || 0 : tournament.entryFeeUSD || 0;
    const totalPool = Math.round(entryFee * (tournament.participants?.length || 0) * 100) / 100;
    const platformFeeAmount = Math.round(totalPool * (tournament.platformFeePercent || TOURNAMENT_PLATFORM_FEE_PERCENT) * 100) / 100;
    const prizePool = Math.max(0, Math.round((totalPool - platformFeeAmount) * 100) / 100);

    tournament.entryFee = entryFee;
    tournament.totalPool = totalPool;
    tournament.platformFeeAmount = platformFeeAmount;
    tournament.prizePool = prizePool;
    tournament.payoutBreakdown = {
      first: Math.round(prizePool * 0.6 * 100) / 100,
      second: Math.round(prizePool * 0.25 * 100) / 100,
      third: Math.round(prizePool * 0.15 * 100) / 100,
    };
  }

  private createPaystackReference(prefix: 'TOUR' | 'MATCH') {
    return `${prefix}-${Math.random().toString(36).slice(2, 11).toUpperCase()}`;
  }

  private verifyPaystackPayment(input: {
    referenceId: string;
    expectedAmount: number;
    currency: Currency;
    context: string;
    userId: string;
  }): ArenaActionResult {
    if (!input.expectedAmount || input.expectedAmount <= 0) {
      return { ok: false, message: 'Invalid payment amount.' };
    }

    const transactionId = uid();
    this.state.transactions.unshift({
      id: transactionId,
      type: 'tournament_entry_fee',
      amount: input.expectedAmount,
      currency: input.currency,
      method: 'Paystack',
      referenceId: input.referenceId,
      createdAt: now(),
      status: 'completed',
      note: `${input.context} (Paystack verified)`,
      details: `Paystack reference ${input.referenceId}`,
    });

    return { ok: true, transactionId, transactionAt: now() };
  }

  private lockFunds(
    userId: string,
    amount: number,
    type: TransactionItem['type'],
    note: string,
    meta?: { transactionId?: string; createdAt?: string }
  ): ArenaActionResult {
    const user = this.getUser(userId);
    if (!user) return { ok: false, message: 'User not found.' };
    if (user.walletBalance < amount) return { ok: false, message: 'Insufficient wallet balance.' };

    const transactionId = meta?.transactionId || uid();
    const createdAt = meta?.createdAt || now();

    this.state.users = this.state.users.map((entry) =>
      entry.id === userId
        ? {
            ...entry,
            walletBalance: Math.round((entry.walletBalance - amount) * 100) / 100,
            lockedBalance: Math.round((entry.lockedBalance + amount) * 100) / 100,
          }
        : entry
    );

    this.state.transactions.unshift({
      id: transactionId,
      type,
      amount,
      createdAt,
      status: 'completed',
      note,
    });

    return { ok: true, transactionId, createdAt };
  }

  private unlockFunds(userId: string, amount: number) {
    this.state.users = this.state.users.map((entry) => {
      if (entry.id !== userId) return entry;
      return {
        ...entry,
        lockedBalance: Math.max(0, Math.round((entry.lockedBalance - amount) * 100) / 100),
      };
    });
  }

  private adjustAvailableBalance(userId: string, amount: number) {
    this.state.users = this.state.users.map((entry) =>
      entry.id === userId
        ? {
            ...entry,
            walletBalance: Math.max(0, Math.round((entry.walletBalance + amount) * 100) / 100),
          }
        : entry
    );
  }

  private isMatchParticipant(match: Match, userId: string) {
    return match.player1Id === userId || match.player2Id === userId;
  }

  private getResultTimingStatus(match: Match) {
    const durationMinutes = typeof match.duration === 'number' ? match.duration : 10;
    const totalSeconds = Math.max(0, Math.round(durationMinutes * 60));
    const startedAtMs = Date.parse(match.startedAt || match.createdAt);
    if (Number.isNaN(startedAtMs)) return { ready: false, remainingSeconds: totalSeconds };

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    return { ready: remainingSeconds === 0, remainingSeconds };
  }

  private formatClock(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  private resolveGameId(user: UserProfile, gameLabel: string) {
    const normalized = gameLabel.toLowerCase();
    if (normalized.includes('dream')) return user.gameIds['Dream League Soccer'];
    if (normalized.includes('call of duty') || normalized.includes('cod')) return user.gameIds['Call of Duty Mobile'];
    if (normalized.includes('efootball')) return user.gameIds.eFootball;
    return user.gameIds.FIFA;
  }

  private createRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      const token = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      code = `RM-${token}`;
    } while (this.state.matches.some((item) => item.roomCode === code));
    return code;
  }

  private buildFallbackRoomCode(matchId: string) {
    const condensed = (matchId || '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 6)
      .padEnd(6, 'X');
    return `RM-${condensed}`;
  }

  private normalizeRoomCode(roomCode: string) {
    return (roomCode || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
  }

  private resolveFirebaseDb() {
    const config = environment.firebase;
    if (!config?.apiKey || !config?.projectId || !config?.appId || !config?.databaseURL) return null;
    try {
      const app = getApps().length ? getApp() : initializeApp(config);
      return getDatabase(app);
    } catch {
      return null;
    }
  }

  private async syncMatchRoomToCloud(match: Match) {
    if (!this.firebaseDb || !match.roomCode) {
      this.lastRoomSyncIssue = 'Realtime database is not configured.';
      return;
    }
    const roomRef = ref(this.firebaseDb, `matchRooms/${match.roomCode}`);
    try {
      await set(roomRef, {
        id: match.id,
        roomCode: match.roomCode,
        player1Id: match.player1Id,
        player1GameId: match.player1GameId,
        game: match.game,
        platform: match.platform || 'Cross-platform',
        matchType: match.matchType || '1v1',
        duration: typeof match.duration === 'number' ? match.duration : 10,
        extraTime: typeof match.extraTime === 'boolean' ? match.extraTime : true,
        penalties: typeof match.penalties === 'boolean' ? match.penalties : true,
        stake: match.stake,
        status: match.status,
        scheduledAt: match.scheduledAt,
        createdAt: match.createdAt || now(),
        escrowTotal: match.escrowTotal || match.stake,
        commissionRate: typeof match.commissionRate === 'number' ? match.commissionRate : MATCHMAKING_PLATFORM_FEE_RATE,
      });
      this.lastRoomSyncIssue = null;
    } catch (error) {
      this.lastRoomSyncIssue = this.getCloudRoomErrorMessage(error);
      throw error;
    }
  }

  private async fetchCloudMatchRoom(
    roomCode: string
  ): Promise<{ ok: true; match: Match | null } | { ok: false; message: string }> {
    if (!this.firebaseDb) {
      return { ok: false, message: 'Realtime database is not configured. Update app config and retry.' };
    }
    const roomRef = ref(this.firebaseDb, `matchRooms/${roomCode}`);
    let snapshot;
    try {
      snapshot = await get(roomRef);
    } catch (error) {
      return { ok: false, message: this.getCloudRoomErrorMessage(error) };
    }
    if (!snapshot.exists()) return { ok: true, match: null };
    const data = snapshot.val() as Partial<Match>;
    if (!data?.id || !data?.player1Id || !data?.game || typeof data.stake !== 'number') {
      return { ok: false, message: 'Room data is incomplete. Create a new room and try again.' };
    }
    return {
      ok: true,
      match: {
      id: data.id,
      roomCode: this.normalizeRoomCode(data.roomCode || roomCode),
      player1Id: data.player1Id,
      player2Id: data.player2Id,
      player1GameId: data.player1GameId || 'N/A',
      player2GameId: data.player2GameId,
      game: data.game,
      platform: data.platform || 'Cross-platform',
      matchType: data.matchType || '1v1',
      duration: typeof data.duration === 'number' ? data.duration : 10,
      extraTime: typeof data.extraTime === 'boolean' ? data.extraTime : true,
      penalties: typeof data.penalties === 'boolean' ? data.penalties : true,
      stake: data.stake,
      status: (data.status as Match['status']) || 'waiting',
      scheduledAt: data.scheduledAt || 'Upcoming',
      createdAt: data.createdAt || now(),
      startedAt: data.startedAt,
      winnerId: data.winnerId,
      screenshotUrl: data.screenshotUrl,
      screenshotFileName: data.screenshotFileName,
      screenshotMimeType: data.screenshotMimeType,
      uploadedAt: data.uploadedAt,
      verifiedAt: data.verifiedAt,
      adminId: data.adminId,
      verificationNote: data.verificationNote,
      escrowTotal: typeof data.escrowTotal === 'number' ? data.escrowTotal : data.stake,
      commissionRate:
        typeof data.commissionRate === 'number'
          ? data.commissionRate
          : Math.min(MATCHMAKING_PLATFORM_FEE_RATE, Math.max(0.05, this.state.commissionRate || 0.1)),
      prize: data.prize,
      prizePaid: data.prizePaid,
      },
    };
  }

  private async removeCloudRoomByCode(roomCode?: string) {
    if (!this.firebaseDb || !roomCode) return;
    await remove(ref(this.firebaseDb, `matchRooms/${this.normalizeRoomCode(roomCode)}`));
  }

  private getCloudRoomErrorMessage(error: unknown) {
    const message = (error as { message?: string } | null)?.message?.toLowerCase() || '';
    if (message.includes('permission')) return 'Database permission denied.';
    if (message.includes('network')) return 'Network error while checking room.';
    if (message.includes('unavailable')) return 'Database service unavailable.';
    return 'Cloud room sync failed.';
  }

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private loadState(): ArenaState {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return this.removeDemoUsers(this.seedState());

    try {
      const parsed = JSON.parse(raw) as Partial<ArenaState>;
      return this.removeDemoUsers(this.normalizeState(parsed));
    } catch {
      return this.removeDemoUsers(this.seedState());
    }
  }

  private normalizeState(input: Partial<ArenaState>): ArenaState {
    const seeded = this.seedState();
    const sourceUsers = input.users || seeded.users;
    const hasAdmin = sourceUsers.some((user) => !!user.isAdmin);
    const users = sourceUsers.map((user, index) => ({
      ...user,
      gameIds: user.gameIds || {
        eFootball: user.gameId,
        'Dream League Soccer': user.gameId,
        FIFA: user.gameId,
        'Call of Duty Mobile': user.gameId,
      },
      lockedBalance: user.lockedBalance || 0,
      goals: typeof user.goals === 'number' ? user.goals : 0,
      isAdmin: hasAdmin ? !!user.isAdmin : index === 0,
    }));

    const seasons = this.normalizeSeasons(input.seasons || seeded.seasons, seeded.seasons);
    const credentials = this.normalizeCredentials(input.credentials || {}, users);

    return {
      users,
      credentials,
      currentUserId:
        typeof input.currentUserId === 'string' && users.some((user) => user.id === input.currentUserId)
          ? input.currentUserId
          : undefined,
      friendRequests: (input.friendRequests || seeded.friendRequests).map((request) => ({
        ...request,
        status:
          request.status === 'accepted' || request.status === 'declined' || request.status === 'pending'
            ? request.status
            : 'pending',
      })),
      challenges: input.challenges || [],
      matches: (input.matches || seeded.matches).map((match) => ({
        ...match,
        roomCode: (match.roomCode || this.buildFallbackRoomCode(match.id)).trim().toUpperCase(),
        status: this.normalizeMatchStatus(match.status),
        platform: match.platform || 'Cross-platform',
        matchType: match.matchType || '1v1',
        duration: typeof match.duration === 'number' ? match.duration : 10,
        extraTime: typeof match.extraTime === 'boolean' ? match.extraTime : true,
        penalties: typeof match.penalties === 'boolean' ? match.penalties : true,
        createdAt: match.createdAt || now(),
        startedAt: match.startedAt || (match.status === 'live' ? match.createdAt || now() : undefined),
        escrowTotal: match.escrowTotal || (match.player2Id ? match.stake * 2 : match.stake),
        commissionRate: typeof match.commissionRate === 'number' ? match.commissionRate : seeded.commissionRate,
        player1GameId: match.player1GameId || users.find((u) => u.id === match.player1Id)?.gameId || 'N/A',
        player2GameId: match.player2GameId || (match.player2Id ? users.find((u) => u.id === match.player2Id)?.gameId : undefined),
      })),
      tournaments: this.withArenaXCalendarTournaments(input.tournaments || seeded.tournaments, users),
      seasons,
      spotlightPosts: this.withRequiredSpotlightPosts(input.spotlightPosts || seeded.spotlightPosts),
      chats: (input.chats || seeded.chats).map((chat) => ({
        ...chat,
        // Remove old seeded/auto bot-like messages from legacy builds.
        messages: (chat.messages || [])
          .filter((message) => !DEFAULT_CHAT_TEXTS.has((message.text || '').trim()))
          .map((message) => ({
            ...message,
            // Remove legacy pasted image URLs from older chat builds.
            image:
              typeof message.image === 'string' &&
              (message.image.startsWith('http://') || message.image.startsWith('https://'))
                ? undefined
                : message.image,
          })),
      })),
      notifications: input.notifications || seeded.notifications,
      transactions: input.transactions || seeded.transactions,
      commissionRate: typeof input.commissionRate === 'number' ? input.commissionRate : seeded.commissionRate,
    };
  }

  private normalizeSeasons(seasons: Season[], fallback: Season[]) {
    const hasNewCalendarFields = seasons.every((season) =>
      season.tournaments?.every(
        (tournament) => Boolean(tournament.registrationOpen && tournament.registrationClose && tournament.matchStart && tournament.matchEnd)
      )
    );
    return hasNewCalendarFields ? seasons : fallback;
  }

  private normalizeMatchStatus(status: string | undefined) {
    if (status === 'waiting' || status === 'live' || status === 'finished') return status;
    if (status === 'pending') return 'waiting';
    if (status === 'active') return 'live';
    return 'finished';
  }

  private withRequiredSpotlightPosts(posts: SpotlightPost[]) {
    const normalized: SpotlightPost[] = [...posts].map((post) => ({
      ...post,
      comments: (post.comments || []).map((comment) => ({
        ...comment,
        reactionUserIds: comment.reactionUserIds || [],
      })),
    }));
    const hasFakerPost = normalized.some((post) => post.title === 'Faker Wins Best Esports Athlete at The Game Awards 2024');
    if (!hasFakerPost) normalized.unshift(this.createFakerSpotlightPost());
    return normalized;
  }

  private createFakerSpotlightPost(): SpotlightPost {
    return {
      id: uid(),
      title: 'Faker Wins Best Esports Athlete at The Game Awards 2024',
      body: 'Lee "Faker" Sang-hyeok (T1, League of Legends) was named Best Esports Athlete at The Game Awards 2024 for the second consecutive year (third overall). Known as the "Unkillable Demon King," Faker reinforced his legacy by leading T1 to another World Championship.',
      tag: 'Result',
      createdAt: now(),
      image: 'assets/spotlight/faker-game-awards-2024.jpg',
      likeUserIds: [],
      comments: [],
    };
  }

  private startSpotlightLiveFeed() {
    if (this.spotlightLiveFeedTimer) return;
    this.spotlightLiveFeedTimer = setInterval(() => {
      const tournamentsLive = this.state.tournaments.filter((tournament) => tournament.status === 'live').length;
      const activeMatches = this.state.matches.filter((match) => match.status === 'live').length;
      const recentPost = this.state.spotlightPosts[0];
      const nextBody = `Live now: ${tournamentsLive} tournament(s) and ${activeMatches} active match(es) across ArenaX.`;
      if (recentPost?.body === nextBody) return;

      this.state.spotlightPosts.unshift({
        id: uid(),
        title: 'ArenaX Live Update',
        body: nextBody,
        tag: 'Announcement',
        createdAt: now(),
        likeUserIds: [],
        comments: [],
      });

      this.state.notifications.unshift({
        id: uid(),
        type: 'spotlight',
        message: 'New Spotlight update is available.',
        createdAt: now(),
        read: false,
      });

      this.persist();
      this.hydrateSubjects();
    }, 120000);
  }

  private normalizeCredentials(inputCredentials: Record<string, string>, users: UserProfile[]) {
    const normalized: Record<string, string> = {};
    const fallbackHash = this.hashPassword('password');

    users.forEach((user) => {
      const savedHash = inputCredentials[user.id];
      normalized[user.id] = typeof savedHash === 'string' && savedHash.trim() ? savedHash : fallbackHash;
    });

    return normalized;
  }

  private removeDemoUsers(state: ArenaState): ArenaState {
    const currentUserId = state.currentUserId;
    const removedIds = new Set<string>();
    const users = state.users.filter((user) => {
      const isDemo =
        DEMO_USER_IDENTIFIERS.has(user.email) ||
        DEMO_USER_IDENTIFIERS.has(user.username) ||
        user.email.toLowerCase().endsWith('@arenax.app');
      if (isDemo && user.id !== currentUserId) {
        removedIds.add(user.id);
        return false;
      }
      return true;
    });

    if (!removedIds.size) return state;

    const keepUser = (id?: string) => !!id && !removedIds.has(id);
    const credentials = Object.entries(state.credentials).reduce<Record<string, string>>((acc, [userId, hash]) => {
      if (!removedIds.has(userId)) acc[userId] = hash;
      return acc;
    }, {});

    return {
      ...state,
      users,
      credentials,
      currentUserId: keepUser(state.currentUserId) ? state.currentUserId : undefined,
      friendRequests: state.friendRequests.filter((item) => keepUser(item.fromUserId) && keepUser(item.toUserId)),
      challenges: state.challenges.filter((item) => keepUser(item.fromUserId) && keepUser(item.toUserId)),
      matches: state.matches.filter((item) => keepUser(item.player1Id) && (!item.player2Id || keepUser(item.player2Id))),
      tournaments: state.tournaments
        .map((tournament) => ({
          ...tournament,
          participants: tournament.participants.filter((participantId) => keepUser(participantId)),
        }))
        .filter((tournament) => tournament.participants.length > 0),
      chats: state.chats
        .map((chat) => ({
          ...chat,
          participantIds: chat.participantIds.filter((participantId) => keepUser(participantId)),
          messages: chat.messages.filter((message) => keepUser(message.senderId)),
        }))
        .filter((chat) => chat.participantIds.length > 0),
      notifications: state.notifications.filter((item) => !item.userId || keepUser(item.userId)),
      spotlightPosts: state.spotlightPosts.map((post) => ({
        ...post,
        likeUserIds: (post.likeUserIds || []).filter((userId) => keepUser(userId)),
        comments: (post.comments || []).filter((comment) => keepUser(comment.userId)),
      })),
    };
  }

  private hashPassword(password: string) {
    // Lightweight local hash for demo auth persistence (not for production security).
    let hash = 5381;
    for (let i = 0; i < password.length; i += 1) {
      hash = (hash * 33) ^ password.charCodeAt(i);
    }
    return `ax_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  private seedState(): ArenaState {
    const userId = uid();
    const players: UserProfile[] = [
      {
        id: userId,
        username: 'StephenX',
        email: 'stephen@arenax.app',
        gameId: 'AX-102934',
        gameIds: {
          eFootball: 'EFB-121313',
          'Dream League Soccer': 'DLS-882211',
          FIFA: 'FIFA-102934',
          'Call of Duty Mobile': 'CODM-560021',
        },
        avatar: 'assets/ax-ui/logo.png',
        wins: 24,
        losses: 8,
        goals: 52,
        walletBalance: 245,
        lockedBalance: 0,
        online: true,
        isAdmin: true,
      },
      {
        id: uid(),
        username: 'ShadowLynx',
        email: 'shadow@arenax.app',
        gameId: 'AX-992113',
        gameIds: {
          eFootball: 'EFB-992113',
          'Dream League Soccer': 'DLS-992113',
          FIFA: 'FIFA-992113',
          'Call of Duty Mobile': 'CODM-992113',
        },
        avatar: 'assets/ax-ui/wel.jpg',
        wins: 44,
        losses: 18,
        goals: 88,
        walletBalance: 420,
        lockedBalance: 0,
        online: true,
      },
      {
        id: uid(),
        username: 'NovaStrike',
        email: 'nova@arenax.app',
        gameId: 'AX-772114',
        gameIds: {
          eFootball: 'EFB-772114',
          'Dream League Soccer': 'DLS-772114',
          FIFA: 'FIFA-772114',
          'Call of Duty Mobile': 'CODM-772114',
        },
        avatar: 'assets/ax-ui/summit-section.jpg',
        wins: 31,
        losses: 22,
        goals: 71,
        walletBalance: 180,
        lockedBalance: 0,
        online: false,
      },
      {
        id: uid(),
        username: 'BlazeWolf',
        email: 'blaze@arenax.app',
        gameId: 'AX-558832',
        gameIds: {
          eFootball: 'EFB-558832',
          'Dream League Soccer': 'DLS-558832',
          FIFA: 'FIFA-558832',
          'Call of Duty Mobile': 'CODM-558832',
        },
        avatar: 'assets/ax-ui/tournament-area.jpg',
        wins: 58,
        losses: 30,
        goals: 112,
        walletBalance: 680,
        lockedBalance: 0,
        online: true,
      },
      {
        id: uid(),
        username: 'ArenaX Community',
        email: 'community@arenax.app',
        gameId: 'AX-COMMUNITY',
        gameIds: {
          eFootball: 'AX-COMMUNITY',
          'Dream League Soccer': 'AX-COMMUNITY',
          FIFA: 'AX-COMMUNITY',
          'Call of Duty Mobile': 'AX-COMMUNITY',
        },
        avatar: 'assets/ax-ui/logo.png',
        wins: 0,
        losses: 0,
        goals: 0,
        walletBalance: 0,
        lockedBalance: 0,
        online: true,
      },
    ];
    const credentials = players.reduce<Record<string, string>>((acc, player) => {
      acc[player.id] = this.hashPassword('password');
      return acc;
    }, {});

    const liveMatch: Match = {
      id: uid(),
      player1Id: userId,
      player2Id: players[1].id,
      player1GameId: players[0].gameIds.FIFA,
      player2GameId: players[1].gameIds.FIFA,
      game: 'FIFA',
      platform: 'PlayStation',
      matchType: '1v1',
      duration: 10,
      extraTime: true,
      penalties: true,
      stake: 50,
      status: 'live',
      scheduledAt: 'Tonight · 9:30 PM',
      createdAt: now(),
      startedAt: now(),
      escrowTotal: 100,
      commissionRate: 0.15,
    };

    const pendingVerificationMatch: Match = {
      id: uid(),
      player1Id: players[1].id,
      player2Id: players[3].id,
      player1GameId: players[1].gameIds['Call of Duty Mobile'],
      player2GameId: players[3].gameIds['Call of Duty Mobile'],
      game: 'Call of Duty Mobile',
      platform: 'Cross-platform',
      matchType: '1v1',
      duration: 10,
      extraTime: false,
      penalties: false,
      stake: 15,
      status: 'pending_verification',
      scheduledAt: 'Today · 6:30 PM',
      createdAt: now(),
      startedAt: now(),
      winnerId: players[1].id,
      screenshotUrl: 'assets/Call-of-Duty-Mobile-groupe-de-guerriers.jpg',
      screenshotFileName: 'codm-result.jpg',
      screenshotMimeType: 'image/jpeg',
      uploadedAt: now(),
      escrowTotal: 30,
      commissionRate: 0.15,
      prize: 30,
    };

    const seasons = [2026, 2027, 2028].map((year) => this.automation.generateSeason(year, players));

    return {
      users: players,
      credentials,
      currentUserId: undefined,
      friendRequests: [],
      challenges: [
        {
          id: uid(),
          fromUserId: players[1].id,
          toUserId: userId,
          game: 'FIFA',
          stake: 25,
          matchTime: 'Tomorrow · 7:00 PM',
          status: 'pending',
          createdAt: now(),
        },
      ],
      matches: [
        liveMatch,
        pendingVerificationMatch,
        {
          id: uid(),
          player1Id: players[2].id,
          player1GameId: players[2].gameIds.eFootball,
          game: 'eFootball',
          platform: 'Cross-platform',
          matchType: '1v1',
          duration: 10,
          extraTime: true,
          penalties: true,
          stake: 20,
          status: 'waiting',
          scheduledAt: 'Tomorrow · 8:00 PM',
          createdAt: now(),
          escrowTotal: 20,
          commissionRate: 0.15,
        },
      ],
      tournaments: this.withArenaXCalendarTournaments([], players),
      seasons,
      spotlightPosts: [
        this.createFakerSpotlightPost(),
        {
          id: uid(),
          title: 'Winter Championship Registration Open',
          body: 'Join the COD Mobile bracket this week. Entry fee is $5 with automatic payout to the champion.',
          tag: 'Announcement',
          createdAt: now(),
          image: 'assets/Call-of-Duty-Mobile-groupe-de-guerriers.jpg',
          likeUserIds: [players[1].id],
          comments: [],
        },
        {
          id: uid(),
          title: 'Top 3 Players This Week',
          body: 'ShadowLynx, BlazeWolf, and StephenX lead the ArenaX ranked board.',
          tag: 'Leaderboard',
          createdAt: now(),
          image: 'assets/ax-ui/summit-section.jpg',
          likeUserIds: [],
          comments: [],
        },
      ],
      chats: [],
      notifications: [
        {
          id: uid(),
          type: 'challenge',
          message: 'ShadowLynx challenged you · FIFA · $25',
          createdAt: now(),
          read: false,
        },
      ],
      transactions: [
        {
          id: uid(),
          type: 'reward',
          amount: 85,
          createdAt: now(),
          status: 'completed',
          note: 'Previous match payout',
        },
      ],
      commissionRate: 0.15,
    };
  }

  private withArenaXCalendarTournaments(existing: Tournament[], users: UserProfile[]) {
    const baseParticipants = users.slice(0, 5).map((user) => user.id);
    const year = new Date().getFullYear();
    const create = (
      title: string,
      game: Tournament['game'],
      registrationOpenAt: string,
      registrationCloseAt: string,
      startsAt: string,
      endsAt: string,
      seasonKey: string,
      image: string,
      maxPlayers: number,
      status: Tournament['status'],
      participantsCount: number
    ): Tournament => {
      const participants = baseParticipants.slice(0, Math.min(participantsCount, baseParticipants.length));
      const tier = this.getTournamentTier(title);
      const tierFees = this.getTierFees(tier);
      const entryFeeUSD = tierFees.usd;
      const totalPool = participants.length * entryFeeUSD;
      const platformFeeAmount = totalPool * TOURNAMENT_PLATFORM_FEE_PERCENT;
      const prizePool = totalPool - platformFeeAmount;
      return {
        id: uid(),
        title,
        game,
        tier,
        entryFee: entryFeeUSD,
        entryFeeNGN: tierFees.ngn,
        entryFeeUSD,
        paymentCurrency: 'USD',
        platformFeePercent: TOURNAMENT_PLATFORM_FEE_PERCENT,
        maxPlayers,
        status,
        totalPool,
        platformFeeAmount,
        prizePool,
        payoutBreakdown: {
          first: Math.round(prizePool * 0.6 * 100) / 100,
          second: Math.round(prizePool * 0.25 * 100) / 100,
          third: Math.round(prizePool * 0.15 * 100) / 100,
        },
        participants,
        startsAt,
        registrationOpenAt,
        registrationCloseAt,
        endsAt,
        seasonKey,
        lifecycleState: 'upcoming',
        image,
      };
    };

    const calendarTournaments: Tournament[] = [
      create(
        'DLS Winter Cup',
        'Dream League Soccer',
        `${year}-01-01T00:00:00.000Z`,
        `${year}-01-10T23:59:59.000Z`,
        `${year}-01-15T18:00:00.000Z`,
        `${year}-01-30T21:00:00.000Z`,
        'WINTER',
        'assets/Dls 26.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'eFootball Winter Cup',
        'eFootball',
        `${year}-01-01T00:00:00.000Z`,
        `${year}-01-10T23:59:59.000Z`,
        `${year}-01-15T18:00:00.000Z`,
        `${year}-01-30T21:00:00.000Z`,
        'WINTER',
        'assets/Efootball.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'FIFA Winter Cup',
        'FIFA',
        `${year}-01-01T00:00:00.000Z`,
        `${year}-01-10T23:59:59.000Z`,
        `${year}-01-15T18:00:00.000Z`,
        `${year}-01-30T21:00:00.000Z`,
        'WINTER',
        'assets/FIFA.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'DLS Rising Stars Cup',
        'Dream League Soccer',
        `${year}-04-01T00:00:00.000Z`,
        `${year}-04-12T23:59:59.000Z`,
        `${year}-04-18T18:00:00.000Z`,
        `${year}-05-05T21:00:00.000Z`,
        'RISING_STARS',
        'assets/Dls.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'eFootball Rising Stars Cup',
        'eFootball',
        `${year}-04-01T00:00:00.000Z`,
        `${year}-04-12T23:59:59.000Z`,
        `${year}-04-18T18:00:00.000Z`,
        `${year}-05-05T21:00:00.000Z`,
        'RISING_STARS',
        'assets/Efootball.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'FIFA Rising Stars Cup',
        'FIFA',
        `${year}-04-01T00:00:00.000Z`,
        `${year}-04-12T23:59:59.000Z`,
        `${year}-04-18T18:00:00.000Z`,
        `${year}-05-05T21:00:00.000Z`,
        'RISING_STARS',
        'assets/FIFA.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'DLS Knockout Masters',
        'Dream League Soccer',
        `${year}-07-01T00:00:00.000Z`,
        `${year}-07-15T23:59:59.000Z`,
        `${year}-07-20T18:00:00.000Z`,
        `${year}-08-10T21:00:00.000Z`,
        'KNOCKOUT',
        'assets/Dls 26.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'eFootball Knockout Masters',
        'eFootball',
        `${year}-07-01T00:00:00.000Z`,
        `${year}-07-15T23:59:59.000Z`,
        `${year}-07-20T18:00:00.000Z`,
        `${year}-08-10T21:00:00.000Z`,
        'KNOCKOUT',
        'assets/Efootball.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'FIFA Knockout Masters',
        'FIFA',
        `${year}-07-01T00:00:00.000Z`,
        `${year}-07-15T23:59:59.000Z`,
        `${year}-07-20T18:00:00.000Z`,
        `${year}-08-10T21:00:00.000Z`,
        'KNOCKOUT',
        'assets/FIFA.jpeg',
        128,
        'upcoming',
        5
      ),
      create(
        'DLS Champions Showcase',
        'Dream League Soccer',
        `${year}-10-01T00:00:00.000Z`,
        `${year}-10-12T23:59:59.000Z`,
        `${year}-10-18T18:00:00.000Z`,
        `${year}-11-10T21:00:00.000Z`,
        'CHAMPIONS',
        'assets/Dls.jpeg',
        64,
        'upcoming',
        4
      ),
      create(
        'eFootball All-Star Arena',
        'eFootball',
        `${year}-10-01T00:00:00.000Z`,
        `${year}-10-12T23:59:59.000Z`,
        `${year}-10-18T18:00:00.000Z`,
        `${year}-11-10T21:00:00.000Z`,
        'CHAMPIONS',
        'assets/Efootball.jpeg',
        64,
        'upcoming',
        4
      ),
      create(
        'FIFA Season Honors Clash',
        'FIFA',
        `${year}-10-01T00:00:00.000Z`,
        `${year}-10-12T23:59:59.000Z`,
        `${year}-10-18T18:00:00.000Z`,
        `${year}-11-10T21:00:00.000Z`,
        'CHAMPIONS',
        'assets/FIFA.jpeg',
        64,
        'upcoming',
        4
      ),
    ];

    const knownTitles = new Set(calendarTournaments.map((item) => item.title.toLowerCase()));
    const preserved = (existing || []).filter((item) => !knownTitles.has(item.title.toLowerCase()));
    const merged = [...calendarTournaments, ...preserved];

    const normalized = merged.map((tournament) => ({
      ...tournament,
      registrationOpenAt: tournament.registrationOpenAt || tournament.startsAt,
      registrationCloseAt: tournament.registrationCloseAt || tournament.startsAt,
      endsAt: tournament.endsAt || tournament.startsAt,
      entryFee:
        typeof tournament.entryFee === 'number' && tournament.entryFee > 0
          ? tournament.entryFee
          : DEFAULT_TOURNAMENT_ENTRY_FEE,
      lifecycleState: tournament.lifecycleState || 'upcoming',
    }));

    for (const tournament of normalized) {
      this.applyTierPricing(tournament);
    }

    return normalized;
  }
}
