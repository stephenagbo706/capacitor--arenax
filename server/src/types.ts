import type { Request } from 'express';

export type ChatRoomType = 'PRIVATE' | 'MATCH' | 'TOURNAMENT' | 'GROUP';
export type ChatMessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';

export interface AuthUser {
  uid: string;
  email?: string;
  name?: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export interface ChatRoomDto {
  id: string;
  type: ChatRoomType;
  participantIds: string[];
  createdAt: string;
  updatedAt: string;
  lastMessage?: ChatMessageDto;
}

export interface ChatMessageDto {
  id: string;
  roomId: string;
  senderId: string;
  text?: string;
  messageType: ChatMessageType;
  replyToMessageId?: string;
  attachmentUrl?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  deletedBy?: string;
  status: 'sent' | 'delivered' | 'seen';
  reaction?: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}

export interface ChatReadPayload {
  roomId: string;
  userId: string;
  readAt: string;
  messages: ChatMessageDto[];
}
