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

  startSwipe(event: TouchEvent) {
    const touch = event.changedTouches[0];
    this.swipeStart = { x: touch.clientX, y: touch.clientY };
  }

  endSwipe(message: ChatMessage, event: TouchEvent) {
    if (!this.swipeStart) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.swipeStart.x;
    const deltaY = Math.abs(touch.clientY - this.swipeStart.y);
    this.swipeStart = undefined;
    if (Math.abs(deltaX) > 60 && deltaY < 40) {
      this.replyingTo = message;
    }
  }

  clearReply() {
    this.replyingTo = null;
  }

  markThreadSeen() {
    if (!this.chat) return;
    const opponentId = this.getOpponentId(this.chat);
    this.arena.markAllUserMessagesSeen(this.chat.id, opponentId);
  }
}
