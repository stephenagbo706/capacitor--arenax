import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  ArenaState,
  ChatThread,
  Challenge,
  FriendRequest,
  Match,
  NotificationItem,
  SpotlightPost,
  SupportedGame,
  Tournament,
  TransactionItem,
  UserProfile,
} from '../models/arena.models';

const STORAGE_KEY = 'arenax_state_v2';
const DEFAULT_CHAT_TEXTS = new Set([
  'Hey! Ready to battle? I am online now.',
  'Ready for the rematch tonight?',
  'Challenge accepted. Meet you in the arena!',
]);

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

@Injectable({ providedIn: 'root' })
export class ArenaService {
  private state: ArenaState;

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

  constructor() {
    this.state = this.loadState();
    this.hydrateSubjects();
  }

  login(email: string, _password: string) {
    const user = this.state.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return { ok: false, message: 'No account found for this email.' };
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
  }) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in to create a match.' };
    if (payload.stake <= 0 || Number.isNaN(payload.stake)) return { ok: false, message: 'Stake must be above zero.' };
    if (current.walletBalance < payload.stake) return { ok: false, message: 'Insufficient available balance.' };

    const lockResult = this.lockFunds(current.id, payload.stake, 'stake_lock', `Stake lock for ${payload.game}`);
    if (!lockResult.ok) return lockResult;

    const roomCode = (payload.roomCode || this.createRoomCode()).trim().toUpperCase();
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
      commissionRate: this.state.commissionRate,
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
    return { ok: true, matchId: match.id, roomCode };
  }

  joinStakeMatch(matchId: string) {
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
    return { ok: true };
  }

  joinStakeMatchByRoomCode(roomCode: string) {
    const normalized = roomCode.trim().toUpperCase();
    if (!normalized) return { ok: false, message: 'Enter a valid room ID.' };

    const waitingMatch = this.state.matches.find((item) => item.roomCode === normalized && item.status === 'waiting');
    if (waitingMatch) return this.joinStakeMatch(waitingMatch.id);

    const existingMatch = this.state.matches.find((item) => item.roomCode === normalized);
    if (existingMatch) return { ok: false, message: 'Room found, but it is no longer waiting for an opponent.' };
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

  joinTournament(tournamentId: string) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in to join.' };

    const tournament = this.state.tournaments.find((item) => item.id === tournamentId);
    if (!tournament) return { ok: false, message: 'Tournament not found.' };
    if (tournament.status === 'ended') return { ok: false, message: 'Tournament already ended.' };
    if (tournament.participants.includes(current.id)) return { ok: false, message: 'You already joined this tournament.' };
    if (tournament.participants.length >= tournament.maxPlayers) return { ok: false, message: 'Tournament is full.' };
    if (current.walletBalance < tournament.entryFee) return { ok: false, message: 'Insufficient wallet balance.' };

    const lockResult = this.lockFunds(current.id, tournament.entryFee, 'entry_lock', `Tournament entry: ${tournament.title}`);
    if (!lockResult.ok) return lockResult;

    tournament.participants.push(current.id);
    tournament.prizePool = tournament.participants.length * tournament.entryFee;
    if (tournament.status === 'upcoming') tournament.status = 'live';

    this.state.notifications.unshift({
      id: uid(),
      type: 'tournament',
      message: `Joined tournament: ${tournament.title}`,
      createdAt: now(),
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

    if (tournament.participants.length === tournament.maxPlayers) {
      this.completeTournament(tournament.id);
    } else {
      this.persist();
      this.hydrateSubjects();
    }

    return { ok: true };
  }

  completeTournament(tournamentId: string, forcedWinnerId?: string) {
    const tournament = this.state.tournaments.find((item) => item.id === tournamentId);
    if (!tournament) return { ok: false, message: 'Tournament not found.' };
    if (!tournament.participants.length) return { ok: false, message: 'No participants registered.' };

    const winnerId =
      forcedWinnerId && tournament.participants.includes(forcedWinnerId)
        ? forcedWinnerId
        : tournament.participants[Math.floor(Math.random() * tournament.participants.length)];

    for (const participantId of tournament.participants) {
      this.unlockFunds(participantId, tournament.entryFee);
    }
    this.adjustAvailableBalance(winnerId, tournament.prizePool);

    tournament.status = 'ended';
    tournament.winnerId = winnerId;

    this.state.transactions.unshift({
      id: uid(),
      type: 'reward',
      amount: tournament.prizePool,
      createdAt: now(),
      status: 'completed',
      note: `Tournament payout: ${tournament.title}`,
    });

    this.state.spotlightPosts.unshift({
      id: uid(),
      title: `${tournament.title} Champion`,
      body: `${this.getUser(winnerId)?.username || 'A player'} won ${tournament.game} and earned $${tournament.prizePool}.`,
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
    this.persist();
    this.hydrateSubjects();
    return chatId;
  }

  sendMessage(chatId: string, message: { text?: string; image?: string }) {
    const current = this.getCurrentUser();
    if (!current) return;
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    if (!chat.participantIds.includes(current.id)) return;
    const text = (message.text || '').trim();
    if (!text && !message.image) return;
    chat.messages.push({
      id: uid(),
      senderId: current.id,
      text,
      image: message.image,
      sentAt: now(),
    });
    for (const participantId of chat.participantIds) {
      if (participantId === current.id) continue;
      this.pushIncomingChatNotification(chat.id, current.id, text || 'Sent you a message.', participantId);
    }
    this.persist();
    this.hydrateSubjects();
  }

  simulateReply(chatId: string) {
    const chat = this.state.chats.find((c) => c.id === chatId);
    if (!chat) return;
    const currentUserId = this.getCurrentUser()?.id;
    if (currentUserId && !chat.participantIds.includes(currentUserId)) return;
    const opponentId = chat.participantIds.find((id) => id !== currentUserId) || chat.participantIds[0];
    chat.messages.push({
      id: uid(),
      senderId: opponentId,
      text: 'Challenge accepted. Meet you in the arena!',
      sentAt: now(),
    });
    if (currentUserId) {
      this.pushIncomingChatNotification(chat.id, opponentId, 'Challenge accepted. Meet you in the arena!', currentUserId);
    }
    this.persist();
    this.hydrateSubjects();
  }

  deposit(amount: number) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (amount <= 0 || Number.isNaN(amount)) return { ok: false, message: 'Enter a valid deposit amount.' };

    this.adjustAvailableBalance(current.id, amount);
    this.state.transactions.unshift({
      id: uid(),
      type: 'deposit',
      amount,
      createdAt: now(),
      status: 'completed',
    });
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
  }

  withdraw(amount: number) {
    const current = this.getCurrentUser();
    if (!current) return { ok: false, message: 'You must be logged in.' };
    if (amount <= 0 || Number.isNaN(amount)) return { ok: false, message: 'Enter a valid withdrawal amount.' };
    if (amount > current.walletBalance) return { ok: false, message: 'Insufficient available balance for this withdrawal.' };

    this.adjustAvailableBalance(current.id, -amount);
    this.state.transactions.unshift({
      id: uid(),
      type: 'withdraw',
      amount,
      createdAt: now(),
      status: 'completed',
    });
    this.persist();
    this.hydrateSubjects();
    return { ok: true };
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
    return this.state.chats.find((chat) => chat.id === chatId && chat.participantIds.includes(currentUserId));
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

  private hydrateSubjects() {
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

  private lockFunds(userId: string, amount: number, type: TransactionItem['type'], note: string) {
    const user = this.getUser(userId);
    if (!user) return { ok: false, message: 'User not found.' };
    if (user.walletBalance < amount) return { ok: false, message: 'Insufficient wallet balance.' };

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
      id: uid(),
      type,
      amount,
      createdAt: now(),
      status: 'completed',
      note,
    });

    return { ok: true };
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

  private persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  private loadState(): ArenaState {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return this.seedState();

    try {
      const parsed = JSON.parse(raw) as Partial<ArenaState>;
      return this.normalizeState(parsed);
    } catch {
      return this.seedState();
    }
  }

  private normalizeState(input: Partial<ArenaState>): ArenaState {
    const seeded = this.seedState();
    const users = (input.users || seeded.users).map((user) => ({
      ...user,
      gameIds: user.gameIds || {
        eFootball: user.gameId,
        'Dream League Soccer': user.gameId,
        FIFA: user.gameId,
        'Call of Duty Mobile': user.gameId,
      },
      lockedBalance: user.lockedBalance || 0,
      goals: typeof user.goals === 'number' ? user.goals : 0,
    }));

    return {
      users,
      currentUserId: input.currentUserId || users[0]?.id,
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
      tournaments: input.tournaments || seeded.tournaments,
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

  private normalizeMatchStatus(status: string | undefined) {
    if (status === 'waiting' || status === 'live' || status === 'finished') return status;
    if (status === 'pending') return 'waiting';
    if (status === 'active') return 'live';
    return 'finished';
  }

  private withRequiredSpotlightPosts(posts: SpotlightPost[]) {
    const normalized = [...posts];
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
    ];

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

    return {
      users: players,
      currentUserId: userId,
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
      tournaments: [
        {
          id: uid(),
          title: 'COD Mobile Weekly Clash',
          game: 'Call of Duty Mobile',
          entryFee: 5,
          maxPlayers: 16,
          status: 'upcoming',
          prizePool: 20,
          participants: [players[1].id, players[2].id, players[3].id, userId],
          startsAt: '2026-03-01T20:00:00.000Z',
          image: 'assets/Call-of-Duty-Mobile-groupe-de-guerriers.jpg',
        },
        {
          id: uid(),
          title: 'ArenaX FIFA Open',
          game: 'FIFA',
          entryFee: 10,
          maxPlayers: 32,
          status: 'live',
          prizePool: 50,
          participants: [players[0].id, players[1].id, players[3].id, players[2].id, userId],
          startsAt: '2026-02-20T17:00:00.000Z',
          image: 'assets/FIFA.jpeg',
        },
      ],
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
}
