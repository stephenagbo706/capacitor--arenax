import { Component } from '@angular/core';
import { AsyncPipe, NgForOf, NgIf } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';
import { ChatThread, FriendRequest, SupportedGame, UserProfile } from '../../core/models/arena.models';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [IonContent, AsyncPipe, NgForOf, NgIf, RouterLink, FormsModule, BottomNavComponent],
  templateUrl: './chat-list.page.html',
  styleUrls: ['./chat-list.page.scss'],
})
export class ChatListPage {
  chats$ = this.arena.chats$;
  users$ = this.arena.users$;
  friendRequests$ = this.arena.friendRequests$;
  currentUserId = this.arena.getCurrentUser()?.id || '';
  searchGameId = '';
  roomGameId = '';
  roomMessage = '';
  roomError = '';
  roomCreatedGameId = '';
  readonly supportedGames: SupportedGame[] = ['FIFA', 'eFootball', 'Dream League Soccer', 'Call of Duty Mobile'];
  selectedRoomGame: SupportedGame = 'FIFA';

  constructor(private arena: ArenaService, private router: Router) {}

  getUser(id: string) {
    return this.arena.getUser(id);
  }

  getGoalRate(user: UserProfile) {
    const total = user.wins + user.losses;
    if (!total) return 0;
    return Math.round((user.wins / total) * 100);
  }

  getGlobalRank(user: UserProfile) {
    return this.arena.getGlobalRank(user.id);
  }

  getOpponentId(chat: ChatThread) {
    return chat.participantIds.find((id) => id !== this.currentUserId) || chat.participantIds[0];
  }

  get currentUser() {
    return this.arena.getCurrentUser();
  }

  get filteredUsers() {
    const query = this.searchGameId.trim().toLowerCase();
    return this.users$.value.filter((user) => {
      if (user.id === this.currentUserId) return false;
      if (!query) return true;
      const gameIds = Object.values(user.gameIds).join(' ').toLowerCase();
      return user.username.toLowerCase().includes(query) || user.gameId.toLowerCase().includes(query) || gameIds.includes(query);
    });
  }

  createRoom() {
    const current = this.currentUser;
    if (!current) return;
    this.roomError = '';
    this.roomMessage = '';
    this.roomCreatedGameId = current.gameIds[this.selectedRoomGame];
    this.roomMessage = `Room created. Share ID: ${this.roomCreatedGameId}`;
  }

  async copyRoomId() {
    if (!this.roomCreatedGameId) return;
    this.roomError = '';
    this.roomMessage = '';

    try {
      await navigator.clipboard.writeText(this.roomCreatedGameId);
      this.roomMessage = 'Game ID copied. Send it to your friend to join your room.';
    } catch {
      this.roomError = 'Could not copy automatically. Please copy the ID manually.';
    }
  }

  joinRoomByGameId() {
    const roomId = this.roomGameId.trim().toLowerCase();
    if (!roomId) {
      this.roomError = 'Enter a valid Game ID.';
      this.roomMessage = '';
      return;
    }

    const target = this.arena.findUserByGameId(roomId);

    if (!target) {
      this.roomError = 'No active player room found for this Game ID.';
      this.roomMessage = '';
      return;
    }

    this.startChat(target.id);
    this.roomError = '';
    this.roomMessage = `Joined ${target.username}'s room.`;
  }

  startChat(userId: string) {
    const chatId = this.arena.createChatWith(userId);
    if (!chatId) return;
    this.router.navigate(['/chat', chatId]);
  }

  sendFriendRequest(userId: string) {
    const result = this.arena.sendFriendRequest(userId);
    if (!result.ok) {
      this.roomError = result.message || 'Unable to send friend request.';
      this.roomMessage = '';
      return;
    }
    this.roomError = '';
    this.roomMessage = 'Friend request sent.';
  }

  respondFriendRequest(request: FriendRequest, status: 'accepted' | 'declined') {
    const result = this.arena.respondToFriendRequest(request.id, status);
    if (!result.ok) {
      this.roomError = result.message || 'Unable to respond to friend request.';
      this.roomMessage = '';
      return;
    }
    this.roomError = '';
    this.roomMessage = status === 'accepted' ? 'Friend request accepted.' : 'Friend request declined.';
  }

  getFriendshipState(userId: string) {
    return this.arena.getFriendshipState(userId);
  }

  trackByUserId(_index: number, user: UserProfile) {
    return user.id;
  }
}
