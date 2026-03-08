import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { ChatThread } from '../../core/models/arena.models';

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
  imageUrl = '';
  currentUserId = this.arena.getCurrentUser()?.id || '';

  constructor(private route: ActivatedRoute, private arena: ArenaService) {
    this.chatId = this.route.snapshot.paramMap.get('id') || '';
  }

  get chat() {
    return this.arena.chats$.value.find((c) => c.id === this.chatId);
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

  send() {
    if (!this.message.trim()) return;
    this.arena.sendMessage(this.chatId, { text: this.message });
    this.message = '';
    setTimeout(() => this.arena.simulateReply(this.chatId), 800);
  }

  sendImage() {
    if (!this.imageUrl.trim()) return;
    this.arena.sendMessage(this.chatId, { image: this.imageUrl });
    this.imageUrl = '';
    setTimeout(() => this.arena.simulateReply(this.chatId), 800);
  }
}
