export type SupportedGame = 'eFootball' | 'Dream League Soccer' | 'FIFA' | 'Call of Duty Mobile';
export type ChallengeStatus = 'pending' | 'accepted' | 'declined';
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';
export type MatchStatus =
  | 'waiting'
  | 'live'
  | 'finished'
  | 'pending_verification'
  | 'verified'
  | 'rejected';
export type TransactionType =
  | 'deposit'
  | 'withdraw'
  | 'reward'
  | 'stake_lock'
  | 'entry_lock'
  | 'tournament_entry_fee'
  | 'refund';
export type NotificationType = 'challenge' | 'match' | 'payment' | 'system' | 'tournament' | 'spotlight' | 'chat' | 'friend';
export type TournamentStatus =
  | 'live'
  | 'upcoming'
  | 'ended'
  | 'open'
  | 'full'
  | 'ready'
  | 'started'
  | 'closed';

export type TournamentEntryStatus = 'registered';

export interface TournamentEntry {
  id: string;
  tournamentId: string;
  userId: string;
  username: string;
  joinedAt: string;
  status: TournamentEntryStatus;
}

export interface TournamentBracketMatch {
  id: string;
  player1Id?: string;
  player2Id?: string;
  winnerId?: string;
  status: 'pending' | 'ready' | 'completed';
}

export interface TournamentBracketRound {
  id: string;
  name: string;
  matches: TournamentBracketMatch[];
}

export interface TournamentBracket {
  generatedAt: string;
  rounds: TournamentBracketRound[];
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  gameId: string;
  gameIds: Record<SupportedGame, string>;
  avatar: string;
  wins: number;
  losses: number;
  goals: number;
  walletBalance: number;
  lockedBalance: number;
  online: boolean;
  isAdmin?: boolean;
}

export interface Challenge {
  id: string;
  fromUserId: string;
  toUserId: string;
  game: string;
  stake: number;
  matchTime: string;
  status: ChallengeStatus;
  createdAt: string;
}

export interface Match {
  id: string;
  roomCode?: string;
  player1Id: string;
  player2Id?: string;
  player1GameId: string;
  player2GameId?: string;
  game: string;
  platform?: string;
  matchType?: string;
  duration?: number;
  extraTime?: boolean;
  penalties?: boolean;
  stake: number;
  status: MatchStatus;
  scheduledAt: string;
  createdAt: string;
  startedAt?: string;
  prize?: number;
  winnerId?: string;
  screenshotUrl?: string;
  screenshotFileName?: string;
  screenshotMimeType?: 'image/png' | 'image/jpeg';
  uploadedAt?: string;
  verifiedAt?: string;
  adminId?: string;
  verificationNote?: string;
  escrowTotal: number;
  commissionRate: number;
  prizePaid?: number;
}

export interface Tournament {
  id: string;
  title: string;
  game: SupportedGame;
  entryFee: number;
  maxPlayers: number;
  status: TournamentStatus;
  prizePool: number;
  participants: string[];
  entries?: TournamentEntry[];
  bracket?: TournamentBracket;
  startsAt: string;
  image: string;
  winnerId?: string;
}

export interface SpotlightComment {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface SpotlightPost {
  id: string;
  title: string;
  body: string;
  tag: 'Announcement' | 'Result' | 'Leaderboard' | 'Community';
  createdAt: string;
  image?: string;
  likeUserIds: string[];
  comments: SpotlightComment[];
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text?: string;
  image?: string;
  sentAt: string;
  status?: 'sent' | 'delivered' | 'seen';
  replyToId?: string;
  reaction?: string;
}

export interface ChatThread {
  id: string;
  participantIds: string[];
  messages: ChatMessage[];
}

export interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: string;
  read: boolean;
  userId?: string;
  chatId?: string;
}

export type Currency = 'NGN' | 'USD';

export interface TransactionItem {
  id: string;
  type: TransactionType;
  amount: number;
  createdAt: string;
  status: 'pending' | 'completed' | 'failed' | 'processed';
  currency?: Currency;
  method?: string;
  referenceId?: string;
  note?: string;
  details?: string;
}

export interface ArenaState {
  users: UserProfile[];
  currentUserId?: string;
  friendRequests: FriendRequest[];
  challenges: Challenge[];
  matches: Match[];
  tournaments: Tournament[];
  spotlightPosts: SpotlightPost[];
  chats: ChatThread[];
  notifications: NotificationItem[];
  transactions: TransactionItem[];
  seasons: Season[];
  commissionRate: number;
}

export type MatchType = '1v1' | '2v2';

export interface SeasonTournament {
  id: string;
  name: string;
  month: string;
  startDate: string;
  endDate: string;
  players: number;
  entryFee: number;
  prizePool: number;
  platformFeePercent: number;
  matchType: MatchType;
  duration: string;
  purpose: string;
  tier: 'beginner' | 'pro' | 'elite';
  rules: string[];
  allowedGames: SupportedGame[];
  banner: string;
  bracketStages: string[];
  playerIds: string[];
  chatHighlight: string;
  notifications: string[];
  subTournaments?: { name: string; game: SupportedGame }[];
}

export interface SeasonLeaderboardEntry {
  playerId: string;
  points: number;
  rank?: number;
}

export interface SeasonAward {
  title: string;
  badge: string;
}

export interface Season {
  id: string;
  title: string;
  year: number;
  tournaments: SeasonTournament[];
  leaderboard: SeasonLeaderboardEntry[];
  awards: SeasonAward[];
}
