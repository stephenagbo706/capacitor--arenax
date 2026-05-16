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
  invitePlayer: 'invite_player',
  notification: 'notification',
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

export interface RealtimeNotificationPayload {
  id: string;
  userId?: string;
  type: 'system' | 'match' | 'invite' | 'chat';
  message: string;
  createdAt: string;
  roomId?: string;
}
