import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonCol, IonContent, IonGrid, IonRow } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { ChatMessage, ChatThread, UserProfile } from '../../core/models/arena.models';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [IonContent, IonGrid, IonRow, IonCol, NgForOf, NgIf, DatePipe, FormsModule],
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
})
export class ChatPage implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private arena = inject(ArenaService);
  private realtime = inject(RealtimeService);

  chatId = '';
  message = '';
  currentUserId = this.arena.getCurrentUser()?.id || '';
  showProfileCard = false;
  typing = false;
  replyingTo?: ChatMessage | null;
  replyComposerOpen = false;
  replyMessage = '';
  attachmentData?: string;
  swipeStart?: { x: number; y: number };
  longPressTimer?: any;
  toast?: string;
  private readonly subs = new Subscription();

  constructor() {
    this.chatId = this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnInit(): void {
    this.subs.add(
      this.realtime.chatTypingStart$.subscribe((payload) => {
        if (payload.roomId === this.chatId && payload.userId !== this.currentUserId) this.typing = true;
      })
    );
    this.subs.add(
      this.realtime.chatTypingStop$.subscribe((payload) => {
        if (payload.roomId === this.chatId && payload.userId !== this.currentUserId) this.typing = false;
      })
    );
    this.markThreadSeen();
  }

  ngOnDestroy(): void {
    this.arena.stopTyping(this.chatId);
    this.subs.unsubscribe();
  }

  get chat() {
    return this.arena.getChatForCurrentUser(this.chatId);
  }

  getUser(id: string) {
    return this.arena.getUser(id);
  }

  getOpponentId(chat: ChatThread) {
    return chat.participantIds.find((id) => id !== this.currentUserId) || chat.participantIds[0];
  }

  isOpponentOnline(chat: ChatThread) {
    return !!this.getUser(this.getOpponentId(chat))?.online;
  }

  toggleOpponentProfile() {
    this.showProfileCard = !this.showProfileCard;
  }

  getOpponent(chat: ChatThread) {
    return this.getUser(this.getOpponentId(chat));
  }

  getRepliedMessage(chat: ChatThread, message: ChatMessage) {
    if (!message.replyToId) return undefined;
    return chat.messages.find((m) => m.id === message.replyToId);
  }

  getTotalMatches(user: UserProfile) {
    return user.wins + user.losses;
  }

  getGoalRate(user: UserProfile) {
    const total = this.getTotalMatches(user);
    if (!total) return 0;
    return Math.round((user.wins / total) * 100);
  }

  getGlobalRank(user: UserProfile) {
    return this.arena.getGlobalRank(user.id);
  }

  async send() {
    if (!this.message.trim() && !this.attachmentData) return;
    if (!this.chat) return;
    try {
      await this.arena.sendMessage(this.chatId, {
        text: this.message,
        image: this.attachmentData,
        replyToId: this.replyingTo?.id,
      });
      this.message = '';
      this.attachmentData = undefined;
      this.replyingTo = null;
      this.markThreadSeen();
    } catch (error) {
      this.showToast((error as { message?: string })?.message || 'Message failed to send');
    }
  }

  onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.attachmentData = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  clearAttachment() {
    this.attachmentData = undefined;
  }

  clearReply() {
    this.replyingTo = null;
    this.replyComposerOpen = false;
    this.replyMessage = '';
  }

  onPressStart(message: ChatMessage, event: TouchEvent | MouseEvent) {
    if (event instanceof TouchEvent) {
      const touch = event.changedTouches[0];
      this.swipeStart = { x: touch.clientX, y: touch.clientY };
    }
    this.longPressTimer = setTimeout(() => this.handleLongPress(message), 550);
  }

  onPressEnd(message: ChatMessage, event: TouchEvent | MouseEvent) {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = undefined;
    }
    if (event instanceof TouchEvent) {
      this.detectSwipeForReply(message, event);
    }
  }

  private detectSwipeForReply(message: ChatMessage, event: TouchEvent) {
    if (!this.swipeStart) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.swipeStart.x;
    const deltaY = Math.abs(touch.clientY - this.swipeStart.y);
    this.swipeStart = undefined;
    if (Math.abs(deltaX) > 60 && deltaY < 40) {
      this.openReplyComposer(message);
    }
  }

  private handleLongPress(message: ChatMessage) {
    this.copyMessage(message, true);
  }

  async copyMessage(message: ChatMessage, preferGameId = false) {
    const textToCopy = preferGameId ? this.extractGameId(message.text) || message.text : message.text;
    if (!textToCopy) return;
    try {
      await navigator.clipboard?.writeText(textToCopy);
      this.showToast(preferGameId ? 'Game ID copied' : 'Message copied');
    } catch {
      this.showToast('Copy failed');
    }
  }

  extractGameId(text?: string) {
    if (!text) return '';
    const match = text.match(/([A-Z]{2,5}-?\d{4,8})/);
    return match ? match[1] : '';
  }

  replyTo(message: ChatMessage) {
    this.openReplyComposer(message);
  }

  openReplyComposer(message: ChatMessage) {
    this.replyingTo = message;
    this.replyComposerOpen = true;
  }

  async sendReply() {
    const text = this.replyMessage.trim();
    if (!text || !this.replyingTo || !this.chat) return;
    try {
      await this.arena.sendMessage(this.chatId, {
        text,
        replyToId: this.replyingTo.id,
      });
      this.replyMessage = '';
      this.replyingTo = null;
      this.replyComposerOpen = false;
      this.markThreadSeen();
    } catch (error) {
      this.showToast((error as { message?: string })?.message || 'Reply failed to send');
    }
  }

  deleteMessage(message: ChatMessage) {
    if (message.senderId !== this.currentUserId) return;
    this.arena.deleteMessage(this.chatId, message.id);
    this.showToast('Message deleted');
  }

  react(message: ChatMessage, emoji: string) {
    this.arena.reactToMessage(this.chatId, message.id, emoji);
  }

  onMessageInput() {
    this.arena.startTyping(this.chatId);
  }

  private showToast(text: string) {
    this.toast = text;
    setTimeout(() => (this.toast = undefined), 1500);
  }

  markThreadSeen() {
    if (!this.chat) return;
    const opponentId = this.getOpponentId(this.chat);
    this.arena.markAllUserMessagesSeen(this.chat.id, opponentId);
  }
}
