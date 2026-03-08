export type SupportedGame = 'eFootball' | 'Dream League Soccer' | 'FIFA' | 'Call of Duty Mobile';
export type ChallengeStatus = 'pending' | 'accepted' | 'declined';
export type MatchStatus =
  | 'waiting'
  | 'live'
  | 'finished'
  | 'pending_verification'
  | 'verified'
  | 'rejected';
export type TransactionType = 'deposit' | 'withdraw' | 'reward' | 'stake_lock' | 'entry_lock' | 'refund';
export type NotificationType = 'challenge' | 'match' | 'payment' | 'system' | 'tournament' | 'spotlight';
export type TournamentStatus = 'live' | 'upcoming' | 'ended';

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
}

export interface ChatThread {
  id: string;
  participantIds: string[];
  messages: ChatMessage[];
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface TransactionItem {
  id: string;
  type: TransactionType;
  amount: number;
  createdAt: string;
  status: 'pending' | 'completed' | 'failed';
  note?: string;
}

export interface ArenaState {
  users: UserProfile[];
  currentUserId?: string;
  challenges: Challenge[];
  matches: Match[];
  tournaments: Tournament[];
  spotlightPosts: SpotlightPost[];
  chats: ChatThread[];
  notifications: NotificationItem[];
  transactions: TransactionItem[];
  commissionRate: number;
}
