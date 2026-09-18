import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import {
  ARENAX_EVENTS,
  BackendChatMessagePayload,
  ChatErrorPayload,
  ChatPresencePayload,
  ChatReadPayload,
  ChatTypingPayload,
  InvitePlayerPayload,
  JoinRoomPayload,
  MatchUpdatePayload,
  RealtimeNotificationPayload,
  SendMessagePayload,
  TournamentUpdatePayload,
} from '../models/realtime.models';

interface RealtimeAuthContext {
  userId: string;
  email?: string;
  username?: string;
  token?: string;
}

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket: Socket | null = null;
  private authContext: RealtimeAuthContext | null = null;
  private readonly activeRooms = new Set<string>();

  readonly connectionState$ = new BehaviorSubject<'disconnected' | 'connecting' | 'connected' | 'reconnecting'>(
    'disconnected'
  );
  readonly message$ = new Subject<SendMessagePayload>();
  readonly matchUpdate$ = new Subject<MatchUpdatePayload>();
  readonly invite$ = new Subject<InvitePlayerPayload>();
  readonly tournamentUpdate$ = new Subject<TournamentUpdatePayload>();
  readonly notification$ = new Subject<RealtimeNotificationPayload>();
  readonly chatMessage$ = new Subject<BackendChatMessagePayload>();
  readonly chatDelivered$ = new Subject<BackendChatMessagePayload>();
  readonly chatRead$ = new Subject<ChatReadPayload>();
  readonly chatDeleted$ = new Subject<BackendChatMessagePayload>();
  readonly chatTypingStart$ = new Subject<ChatTypingPayload>();
  readonly chatTypingStop$ = new Subject<ChatTypingPayload>();
  readonly chatPresence$ = new Subject<ChatPresencePayload>();
  readonly chatError$ = new Subject<ChatErrorPayload>();

  connect(context: RealtimeAuthContext) {
    this.authContext = context;
    if (!this.socket) {
      this.initializeSocket();
      return;
    }

    if (this.socket.connected) return;
    this.socket.auth = this.buildAuthPayload();
    this.connectionState$.next('connecting');
    this.socket.connect();
  }

  disconnect() {
    this.activeRooms.clear();
    this.authContext = null;
    if (!this.socket) return;
    this.socket.disconnect();
    this.connectionState$.next('disconnected');
  }

  joinRoom(payload: JoinRoomPayload) {
    if (!this.socket || !this.authContext) return;
    const roomKey = `${payload.roomType}:${payload.roomId}`;
    if (this.activeRooms.has(roomKey)) return;
    this.socket.emit(ARENAX_EVENTS.joinRoom, payload);
    this.activeRooms.add(roomKey);
  }

  joinChatRoom(roomId: string) {
    if (!this.socket || !this.authContext) return Promise.resolve(false);
    this.activeRooms.add(`chat:${roomId}`);
    return this.emitWithAck(ARENAX_EVENTS.chatJoin, { roomId }).then((response) => response.ok);
  }

  leaveChatRoom(roomId: string) {
    if (!this.socket) return;
    this.socket.emit(ARENAX_EVENTS.chatLeave, { roomId });
    this.activeRooms.delete(`chat:${roomId}`);
  }

  sendChatMessage(payload: {
    roomId: string;
    text?: string;
    messageType?: 'TEXT' | 'IMAGE';
    replyToMessageId?: string;
    attachmentUrl?: string;
  }) {
    return this.emitWithAck<{ message?: BackendChatMessagePayload }>(ARENAX_EVENTS.chatSend, payload);
  }

  markChatDelivered(roomId: string, messageId: string) {
    return this.emitWithAck<{ message?: BackendChatMessagePayload }>(ARENAX_EVENTS.chatDelivered, { roomId, messageId });
  }

  markChatRead(roomId: string) {
    return this.emitWithAck<Partial<ChatReadPayload>>(ARENAX_EVENTS.chatRead, { roomId });
  }

  deleteChatMessage(roomId: string, messageId: string) {
    return this.emitWithAck<{ message?: BackendChatMessagePayload }>(ARENAX_EVENTS.chatDelete, { roomId, messageId });
  }

  startTyping(roomId: string) {
    this.socket?.emit(ARENAX_EVENTS.chatTypingStart, { roomId });
  }

  stopTyping(roomId: string) {
    this.socket?.emit(ARENAX_EVENTS.chatTypingStop, { roomId });
  }

  leaveRoom(payload: JoinRoomPayload) {
    if (!this.socket) return;
    this.socket.emit(ARENAX_EVENTS.leaveRoom, payload);
    this.activeRooms.delete(`${payload.roomType}:${payload.roomId}`);
  }

  sendMessage(payload: SendMessagePayload) {
    this.socket?.emit(ARENAX_EVENTS.sendMessage, payload);
  }

  sendTeamMessage(payload: SendMessagePayload) {
    this.socket?.emit(ARENAX_EVENTS.teamMessage, payload);
  }

  sendPrivateMessage(payload: SendMessagePayload) {
    this.socket?.emit(ARENAX_EVENTS.privateMessage, payload);
  }

  sendMatchUpdate(payload: MatchUpdatePayload) {
    this.socket?.emit(ARENAX_EVENTS.matchUpdate, payload);
  }

  invitePlayer(payload: InvitePlayerPayload) {
    this.socket?.emit(ARENAX_EVENTS.invitePlayer, payload);
  }

  sendTournamentUpdate(payload: TournamentUpdatePayload) {
    this.socket?.emit(ARENAX_EVENTS.tournamentUpdate, payload);
    const eventName = this.resolveTournamentEventName(payload.action);
    if (eventName) this.socket?.emit(eventName, payload);
  }

  private initializeSocket() {
    const socketUrl = environment.socketUrl || 'http://localhost:3000';
    this.connectionState$.next('connecting');

    this.socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: false,
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.2,
      auth: this.buildAuthPayload(),
    });

    this.socket.on(ARENAX_EVENTS.connect, () => {
      this.connectionState$.next('connected');
      this.rejoinRooms();
    });

    this.socket.on(ARENAX_EVENTS.reconnect, () => {
      this.connectionState$.next('connected');
      this.rejoinRooms();
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.connectionState$.next('reconnecting');
      if (this.socket) this.socket.auth = this.buildAuthPayload();
    });

    this.socket.on(ARENAX_EVENTS.disconnect, () => {
      this.connectionState$.next('disconnected');
    });

    this.socket.on(ARENAX_EVENTS.sendMessage, (payload: SendMessagePayload) => this.message$.next(payload));
    this.socket.on(ARENAX_EVENTS.teamMessage, (payload: SendMessagePayload) => this.message$.next(payload));
    this.socket.on(ARENAX_EVENTS.privateMessage, (payload: SendMessagePayload) => this.message$.next(payload));
    this.socket.on(ARENAX_EVENTS.matchUpdate, (payload: MatchUpdatePayload) => this.matchUpdate$.next(payload));
    this.socket.on(ARENAX_EVENTS.tournamentUpdate, (payload: TournamentUpdatePayload) =>
      this.tournamentUpdate$.next(payload)
    );
    this.socket.on(ARENAX_EVENTS.tournamentCreated, (payload: TournamentUpdatePayload) => this.tournamentUpdate$.next(payload));
    this.socket.on(ARENAX_EVENTS.playerJoined, (payload: TournamentUpdatePayload) => this.tournamentUpdate$.next(payload));
    this.socket.on(ARENAX_EVENTS.tournamentStarted, (payload: TournamentUpdatePayload) =>
      this.tournamentUpdate$.next(payload)
    );
    this.socket.on(ARENAX_EVENTS.matchLive, (payload: TournamentUpdatePayload) => this.tournamentUpdate$.next(payload));
    this.socket.on(ARENAX_EVENTS.scoreUpdate, (payload: TournamentUpdatePayload) => this.tournamentUpdate$.next(payload));
    this.socket.on(ARENAX_EVENTS.matchEnded, (payload: TournamentUpdatePayload) => this.tournamentUpdate$.next(payload));
    this.socket.on(ARENAX_EVENTS.tournamentCompleted, (payload: TournamentUpdatePayload) =>
      this.tournamentUpdate$.next(payload)
    );
    this.socket.on(ARENAX_EVENTS.invitePlayer, (payload: InvitePlayerPayload) => this.invite$.next(payload));
    this.socket.on(ARENAX_EVENTS.notification, (payload: RealtimeNotificationPayload) =>
      this.notification$.next(payload)
    );
    this.socket.on(ARENAX_EVENTS.chatMessage, (payload: BackendChatMessagePayload) => this.chatMessage$.next(payload));
    this.socket.on(ARENAX_EVENTS.chatDelivered, (payload: { message: BackendChatMessagePayload }) => {
      if (payload?.message) this.chatDelivered$.next(payload.message);
    });
    this.socket.on(ARENAX_EVENTS.chatRead, (payload: ChatReadPayload) => this.chatRead$.next(payload));
    this.socket.on(ARENAX_EVENTS.chatMessageDeleted, (payload: { message: BackendChatMessagePayload }) => {
      if (payload?.message) this.chatDeleted$.next(payload.message);
    });
    this.socket.on(ARENAX_EVENTS.chatTypingStart, (payload: ChatTypingPayload) => this.chatTypingStart$.next(payload));
    this.socket.on(ARENAX_EVENTS.chatTypingStop, (payload: ChatTypingPayload) => this.chatTypingStop$.next(payload));
    this.socket.on(ARENAX_EVENTS.chatPresence, (payload: ChatPresencePayload) => this.chatPresence$.next(payload));
    this.socket.on(ARENAX_EVENTS.chatError, (payload: ChatErrorPayload) => this.chatError$.next(payload));
    this.socket.on('connect_error', (error) => {
      this.chatError$.next({ code: 'SOCKET_ERROR', message: error.message || 'Unable to connect to chat.' });
    });

    this.socket.connect();
  }

  private buildAuthPayload() {
    if (!this.authContext) return {};
    return {
      userId: this.authContext.userId,
      email: this.authContext.email,
      username: this.authContext.username,
      token: this.authContext.token,
    };
  }

  private rejoinRooms() {
    if (!this.socket || !this.authContext) return;
    for (const key of this.activeRooms) {
      if (key.startsWith('chat:')) {
        this.socket.emit(ARENAX_EVENTS.chatJoin, { roomId: key.slice(5) });
        continue;
      }
      const [roomType, roomId] = key.split(':');
      if (!roomId || !roomType) continue;
      this.socket.emit(ARENAX_EVENTS.joinRoom, {
        roomId,
        roomType,
        userId: this.authContext.userId,
      });
    }
  }

  private emitWithAck<T = Record<string, unknown>>(eventName: string, payload: unknown) {
    return new Promise<{ ok: boolean; error?: ChatErrorPayload } & T>((resolve) => {
      if (!this.socket || !this.socket.connected) {
        resolve({ ok: false, error: { code: 'SOCKET_ERROR', message: 'Chat is disconnected.' } } as unknown as {
          ok: boolean;
        } & T);
        return;
      }
      this.socket.timeout(10000).emit(eventName, payload, (error: Error | null, response: ({ ok: boolean } & T) | undefined) => {
        if (error) {
          resolve({
            ok: false,
            error: { code: 'SOCKET_ERROR', message: 'Chat server did not acknowledge the request.' },
          } as unknown as { ok: boolean } & T);
          return;
        }
        resolve((response || { ok: false, error: { code: 'SOCKET_ERROR', message: 'Invalid chat server response.' } }) as {
          ok: boolean;
        } & T);
      });
    });
  }

  private resolveTournamentEventName(action: TournamentUpdatePayload['action']) {
    if (action === 'tournament_created') return ARENAX_EVENTS.tournamentCreated;
    if (action === 'player_joined') return ARENAX_EVENTS.playerJoined;
    if (action === 'tournament_started') return ARENAX_EVENTS.tournamentStarted;
    if (action === 'match_live') return ARENAX_EVENTS.matchLive;
    if (action === 'score_updated') return ARENAX_EVENTS.scoreUpdate;
    if (action === 'match_ended') return ARENAX_EVENTS.matchEnded;
    if (action === 'tournament_completed') return ARENAX_EVENTS.tournamentCompleted;
    return null;
  }
}
