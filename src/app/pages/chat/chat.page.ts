import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { ChatThread, UserProfile } from '../../core/models/arena.models';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [IonContent, NgForOf, NgIf, DatePipe, FormsModule],
  templateUrl: './chat.page.html',
  styleUrls: ['./chat.page.scss'],
})
export class ChatPage {
  chatId = '';
  message = '';
  currentUserId = this.arena.getCurrentUser()?.id || '';
  showProfileCard = false;

  constructor(private route: ActivatedRoute, private arena: ArenaService) {
    this.chatId = this.route.snapshot.paramMap.get('id') || '';
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
    if (!this.message.trim()) return;
    if (!this.chat) return;
    this.arena.sendMessage(this.chatId, { text: this.message });
    this.message = '';
  }
}
