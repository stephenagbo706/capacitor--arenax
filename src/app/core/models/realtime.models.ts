export const ARENAX_EVENTS = {
  connect: 'connect',
  disconnect: 'disconnect',
  reconnect: 'reconnect',
  joinRoom: 'join_room',
  leaveRoom: 'leave_room',
  sendMessage: 'send_message',
  teamMessage: 'team_message',
  privateMessage: 'private_message',
  matchUpdate: 'match_update',
  tournamentUpdate: 'tournament_update',
  tournamentCreated: 'tournament:created',
  playerJoined: 'player:joined',
  tournamentStarted: 'tournament:started',
  matchLive: 'match:live',
  scoreUpdate: 'score:update',
  matchEnded: 'match:ended',
  tournamentCompleted: 'tournament:completed',
  invitePlayer: 'invite_player',
  notification: 'notification',
  chatJoin: 'chat:join',
  chatLeave: 'chat:leave',
  chatSend: 'chat:send',
  chatMessage: 'chat:message',
  chatDelivered: 'chat:delivered',
  chatRead: 'chat:read',
  chatDelete: 'chat:delete',
  chatMessageDeleted: 'chat:message-deleted',
  chatTypingStart: 'chat:typing:start',
  chatTypingStop: 'chat:typing:stop',
  chatPresence: 'chat:presence',
  chatError: 'chat:error',
} as const;

export type ArenaRoomType = 'lobby' | 'match' | 'team' | 'private';

export interface JoinRoomPayload {
  roomId: string;
  roomType: ArenaRoomType;
  userId: string;
}

export interface SendMessagePayload {
  chatId: string;
  roomId: string;
  senderId: string;
  text?: string;
  image?: string;
  replyToId?: string;
  sentAt: string;
  messageId: string;
  scope: 'room' | 'team' | 'private';
  teamId?: string;
  recipientUserId?: string;
}

export interface MatchUpdatePayload {
  matchId: string;
  roomId: string;
  action: 'created' | 'started' | 'updated' | 'result_submitted' | 'finished';
  actorUserId: string;
  status?: string;
  winnerId?: string;
  roomCode?: string;
  game?: string;
  stake?: number;
  scheduledAt?: string;
  platform?: string;
  matchType?: string;
  duration?: number;
  extraTime?: boolean;
  penalties?: boolean;
  timestamp: string;
}

export interface InvitePlayerPayload {
  fromUserId: string;
  toUserId: string;
  game?: string;
  matchId?: string;
  roomId?: string;
  message: string;
  sentAt: string;
}

export interface TournamentUpdatePayload {
  tournamentId: string;
  action:
    | 'tournament_created'
    | 'player_joined'
    | 'tournament_started'
    | 'match_live'
    | 'score_updated'
    | 'match_ended'
    | 'tournament_completed'
    | 'registration_opened'
    | 'registration_closed'
    | 'bracket_updated'
    | 'match_scheduled'
    | 'lifecycle_updated';
  lifecycleState?: 'upcoming' | 'registration_open' | 'registration_closed' | 'live' | 'completed';
  message?: string;
  timestamp: string;
}

export interface RealtimeNotificationPayload {
  id: string;
  userId?: string;
  type: 'system' | 'match' | 'invite' | 'chat';
  message: string;
  createdAt: string;
  roomId?: string;
}

export interface BackendChatMessagePayload {
  id: string;
  roomId: string;
  senderId: string;
  text?: string;
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM';
  replyToMessageId?: string;
  attachmentUrl?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
  status: 'sent' | 'delivered' | 'seen';
  reaction?: string;
}

export interface BackendChatRoomPayload {
  id: string;
  type: 'PRIVATE' | 'MATCH' | 'TOURNAMENT' | 'GROUP';
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage?: BackendChatMessagePayload;
}

export interface ChatReadPayload {
  roomId: string;
  userId: string;
  readAt: string;
  messages: BackendChatMessagePayload[];
}

export interface ChatPresencePayload {
  userId: string;
  status: 'ONLINE' | 'OFFLINE';
  at: string;
}

export interface ChatTypingPayload {
  roomId: string;
  userId: string;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
}
