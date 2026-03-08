import { Component } from '@angular/core';
import { AsyncPipe, NgForOf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { ChatThread } from '../../core/models/arena.models';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [IonContent, AsyncPipe, NgForOf, RouterLink, BottomNavComponent],
  templateUrl: './chat-list.page.html',
  styleUrls: ['./chat-list.page.scss'],
})
export class ChatListPage {
  chats$ = this.arena.chats$;
  currentUserId = this.arena.getCurrentUser()?.id || '';

  constructor(private arena: ArenaService) {}

  getUser(id: string) {
    return this.arena.getUser(id);
  }

  getOpponentId(chat: ChatThread) {
    return chat.participantIds.find((id) => id !== this.currentUserId) || chat.participantIds[0];
  }
}
