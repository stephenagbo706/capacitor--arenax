import type { Server, Socket } from 'socket.io';
import type { ChatRepository } from './chat-repository';
import type { AuthVerifier } from './firebase-admin';
import { HttpError } from './http-errors';
import type { AuthUser, ChatMessageType } from './types';

interface AuthenticatedSocket extends Socket {
  user?: AuthUser;
}

function roomName(roomId: string) {
  return `chat:${roomId}`;
}

function socketToken(socket: Socket) {
  const authToken = socket.handshake.auth?.['token'];
  if (typeof authToken === 'string' && authToken) return authToken;
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string') return header.replace(/^Bearer\s+/i, '');
  return '';
}

function serializeError(error: unknown) {
  if (error instanceof HttpError) return { code: error.code, message: error.message };
  return { code: 'SOCKET_ERROR', message: 'Realtime chat operation failed.' };
}

export function attachChatSocket(io: Server, chat: ChatRepository, authVerifier: AuthVerifier) {
  const onlineUsers = new Map<string, Set<string>>();
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socketToken(socket);
      if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication token is required.');
      socket.user = await authVerifier.verifyToken(token);
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!;
    const userSockets = onlineUsers.get(user.uid) || new Set<string>();
    userSockets.add(socket.id);
    onlineUsers.set(user.uid, userSockets);
    io.emit('chat:presence', { userId: user.uid, status: 'ONLINE', at: new Date().toISOString() });

    socket.on('chat:join', async (payload: { roomId?: string }, ack?: (response: unknown) => void) => {
      try {
        if (!payload?.roomId) throw new HttpError(400, 'ROOM_NOT_FOUND', 'Room is required.');
        const room = await chat.getRoom(payload.roomId, user.uid);
        await socket.join(roomName(room.id));
        ack?.({ ok: true, room });
      } catch (error) {
        const body = serializeError(error);
        socket.emit('chat:error', body);
        ack?.({ ok: false, error: body });
      }
    });

    socket.on('chat:leave', async (payload: { roomId?: string }) => {
      if (payload?.roomId) await socket.leave(roomName(payload.roomId));
    });

    socket.on(
      'chat:send',
      async (
        payload: {
          roomId?: string;
          text?: string;
          messageType?: ChatMessageType;
          replyToMessageId?: string;
          attachmentUrl?: string;
        },
        ack?: (response: unknown) => void
      ) => {
        try {
          if (!payload?.roomId) throw new HttpError(400, 'ROOM_NOT_FOUND', 'Room is required.');
          const message = await chat.sendMessage(payload.roomId, user.uid, payload);
          io.to(roomName(payload.roomId)).emit('chat:message', message);
          ack?.({ ok: true, message });
        } catch (error) {
          const body = serializeError(error);
          socket.emit('chat:error', body);
          ack?.({ ok: false, error: body });
        }
      }
    );

    socket.on('chat:delivered', async (payload: { messageId?: string; roomId?: string }, ack?: (response: unknown) => void) => {
      try {
        if (!payload?.messageId || !payload.roomId) throw new HttpError(400, 'MESSAGE_NOT_FOUND', 'Message is required.');
        const message = await chat.markDelivered(payload.messageId, user.uid);
        io.to(roomName(payload.roomId)).emit('chat:delivered', { roomId: payload.roomId, message });
        ack?.({ ok: true, message });
      } catch (error) {
        const body = serializeError(error);
        socket.emit('chat:error', body);
        ack?.({ ok: false, error: body });
      }
    });

    socket.on('chat:read', async (payload: { roomId?: string }, ack?: (response: unknown) => void) => {
      try {
        if (!payload?.roomId) throw new HttpError(400, 'ROOM_NOT_FOUND', 'Room is required.');
        const receipt = await chat.markRoomRead(payload.roomId, user.uid);
        io.to(roomName(payload.roomId)).emit('chat:read', receipt);
        ack?.({ ok: true, ...receipt });
      } catch (error) {
        const body = serializeError(error);
        socket.emit('chat:error', body);
        ack?.({ ok: false, error: body });
      }
    });

    socket.on('chat:delete', async (payload: { messageId?: string; roomId?: string }, ack?: (response: unknown) => void) => {
      try {
        if (!payload?.messageId || !payload.roomId) throw new HttpError(400, 'MESSAGE_NOT_FOUND', 'Message is required.');
        const message = await chat.deleteMessage(payload.messageId, user.uid, user.roles);
        io.to(roomName(payload.roomId)).emit('chat:message-deleted', { roomId: payload.roomId, message });
        ack?.({ ok: true, message });
      } catch (error) {
        const body = serializeError(error);
        socket.emit('chat:error', body);
        ack?.({ ok: false, error: body });
      }
    });

    socket.on('chat:typing:start', async (payload: { roomId?: string }) => {
      if (!payload?.roomId) return;
      try {
        await chat.requireMembership(payload.roomId, user.uid);
        socket.to(roomName(payload.roomId)).emit('chat:typing:start', { roomId: payload.roomId, userId: user.uid });
        const key = `${socket.id}:${payload.roomId}`;
        if (typingTimers.has(key)) clearTimeout(typingTimers.get(key));
        typingTimers.set(
          key,
          setTimeout(() => {
            socket.to(roomName(payload.roomId!)).emit('chat:typing:stop', { roomId: payload.roomId, userId: user.uid });
            typingTimers.delete(key);
          }, 3000)
        );
      } catch {
        socket.emit('chat:error', { code: 'UNAUTHORIZED', message: 'You are not a member of this chat room.' });
      }
    });

    socket.on('chat:typing:stop', (payload: { roomId?: string }) => {
      if (!payload?.roomId) return;
      socket.to(roomName(payload.roomId)).emit('chat:typing:stop', { roomId: payload.roomId, userId: user.uid });
    });

    socket.on('disconnect', () => {
      const current = onlineUsers.get(user.uid);
      current?.delete(socket.id);
      if (!current?.size) {
        onlineUsers.delete(user.uid);
        io.emit('chat:presence', { userId: user.uid, status: 'OFFLINE', at: new Date().toISOString() });
      }
    });
  });
}
