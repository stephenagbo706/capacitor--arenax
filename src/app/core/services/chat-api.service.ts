import { Injectable } from '@angular/core';
import { getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { environment } from '../../../environments/environment';
import { BackendChatMessagePayload, BackendChatRoomPayload, ChatReadPayload } from '../models/realtime.models';

type ChatApiErrorResponse = { error?: { code?: string; message?: string } };

@Injectable({ providedIn: 'root' })
export class ChatApiService {
  private readonly apiUrl = (environment.apiUrl || '').replace(/\/$/, '');

  get isConfigured() {
    return Boolean(this.apiUrl);
  }

  async listRooms() {
    return this.request<{ rooms: BackendChatRoomPayload[] }>('GET', '/api/chat/rooms');
  }

  async createPrivateRoom(participantUserId: string) {
    return this.request<{ room: BackendChatRoomPayload }>('POST', '/api/chat/rooms/private', { participantUserId });
  }

  async listMessages(roomId: string, limit = 50, before?: string) {
    const query = new URLSearchParams({ limit: String(limit) });
    if (before) query.set('before', before);
    return this.request<{ messages: BackendChatMessagePayload[] }>(
      'GET',
      `/api/chat/rooms/${encodeURIComponent(roomId)}/messages?${query.toString()}`
    );
  }

  async sendMessage(roomId: string, payload: { text?: string; replyToMessageId?: string; attachmentUrl?: string }) {
    return this.request<{ message: BackendChatMessagePayload }>(
      'POST',
      `/api/chat/rooms/${encodeURIComponent(roomId)}/messages`,
      {
        text: payload.text,
        replyToMessageId: payload.replyToMessageId,
        attachmentUrl: payload.attachmentUrl,
        messageType: payload.attachmentUrl ? 'IMAGE' : 'TEXT',
      }
    );
  }

  async markRead(roomId: string) {
    return this.request<ChatReadPayload>('POST', `/api/chat/rooms/${encodeURIComponent(roomId)}/read`, {});
  }

  async markDelivered(messageId: string) {
    return this.request<{ message: BackendChatMessagePayload }>(
      'POST',
      `/api/chat/messages/${encodeURIComponent(messageId)}/delivered`,
      {}
    );
  }

  async deleteMessage(messageId: string) {
    return this.request<{ message: BackendChatMessagePayload }>(
      'DELETE',
      `/api/chat/messages/${encodeURIComponent(messageId)}`
    );
  }

  async setReaction(messageId: string, reaction: string) {
    return this.request<{ message: BackendChatMessagePayload }>(
      'POST',
      `/api/chat/messages/${encodeURIComponent(messageId)}/reactions`,
      { reaction }
    );
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    if (!this.apiUrl) throw new Error('ArenaX backend API is not configured.');
    const token = await this.getFirebaseToken();
    if (!token) throw new Error('Sign in again before using chat.');

    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => ({}))) as T | ChatApiErrorResponse;
    const maybeError = json as ChatApiErrorResponse;
    if (!response.ok || maybeError.error) {
      throw new Error(maybeError.error?.message || 'ArenaX chat request failed.');
    }
    return json as T;
  }

  private async getFirebaseToken() {
    if (!getApps().length) return '';
    const user = getAuth().currentUser;
    if (!user) return '';
    return user.getIdToken().catch(() => '');
  }
}
