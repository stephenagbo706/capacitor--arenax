import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { ChatMessage, ChatThread, UserProfile } from '../../core/models/arena.models';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [IonContent, NgForOf, NgIf, DatePipe, FormsModule],
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
})
export class ChatPage implements OnInit {
  chatId = '';
  message = '';
  currentUserId = this.arena.getCurrentUser()?.id || '';
  showProfileCard = false;
  typing = false;
  replyingTo?: ChatMessage | null;
  attachmentData?: string;
  swipeStart?: { x: number; y: number };
  longPressTimer?: any;
  toast?: string;

  constructor(private route: ActivatedRoute, private arena: ArenaService) {
    this.chatId = this.route.snapshot.paramMap.get('id') || '';
  }

  ngOnInit(): void {
    this.markThreadSeen();
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

  send() {
    if (!this.message.trim() && !this.attachmentData) return;
    if (!this.chat) return;
    this.arena.sendMessage(this.chatId, {
      text: this.message,
      image: this.attachmentData,
      replyToId: this.replyingTo?.id,
    });
    this.message = '';
    this.attachmentData = undefined;
    this.replyingTo = null;
    this.typing = true;
    setTimeout(() => {
      this.typing = false;
      this.arena.simulateReply(this.chatId);
      this.markThreadSeen();
    }, 1200);
    this.markThreadSeen();
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
      this.replyingTo = message;
    }
  }

  private handleLongPress(message: ChatMessage) {
    this.copyMessage(message, true);
  }

  copyMessage(message: ChatMessage, preferGameId = false) {
    const textToCopy = preferGameId ? this.extractGameId(message.text) || message.text : message.text;
    if (!textToCopy) return;
    navigator.clipboard?.writeText(textToCopy);
    this.showToast(preferGameId ? 'Game ID copied' : 'Message copied');
  }

  extractGameId(text?: string) {
    if (!text) return '';
    const match = text.match(/([A-Z]{2,5}-?\d{4,8})/);
    return match ? match[1] : '';
  }

  replyTo(message: ChatMessage) {
    this.replyingTo = message;
  }

  deleteMessage(message: ChatMessage) {
    if (message.senderId !== this.currentUserId) return;
    this.arena.deleteMessage(this.chatId, message.id);
    this.showToast('Message deleted');
  }

  react(message: ChatMessage, emoji: string) {
    this.arena.reactToMessage(this.chatId, message.id, emoji);
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
