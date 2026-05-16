import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import {
  ARENAX_EVENTS,
  InvitePlayerPayload,
  JoinRoomPayload,
  MatchUpdatePayload,
  RealtimeNotificationPayload,
  SendMessagePayload,
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
  readonly notification$ = new Subject<RealtimeNotificationPayload>();

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
    this.socket.on(ARENAX_EVENTS.invitePlayer, (payload: InvitePlayerPayload) => this.invite$.next(payload));
    this.socket.on(ARENAX_EVENTS.notification, (payload: RealtimeNotificationPayload) =>
      this.notification$.next(payload)
    );

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
      const [roomType, roomId] = key.split(':');
      if (!roomId || !roomType) continue;
      this.socket.emit(ARENAX_EVENTS.joinRoom, {
        roomId,
        roomType,
        userId: this.authContext.userId,
      });
    }
  }
}
