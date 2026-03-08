import { Component } from '@angular/core';
import { AsyncPipe, NgForOf, NgIf, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-spotlight',
  standalone: true,
  imports: [IonContent, AsyncPipe, NgForOf, NgIf, FormsModule, SlicePipe, BottomNavComponent],
  templateUrl: './spotlight.page.html',
  styleUrls: ['./spotlight.page.scss'],
})
export class SpotlightPage {
  spotlightPosts$ = this.arena.spotlightPosts$;
  comments: Record<string, string> = {};

  constructor(private arena: ArenaService) {}

  hasLiked(postId: string) {
    const currentUserId = this.arena.getCurrentUser()?.id;
    const post = this.spotlightPosts$.value.find((item) => item.id === postId);
    if (!post || !currentUserId) return false;
    return post.likeUserIds.includes(currentUserId);
  }

  toggleLike(postId: string) {
    this.arena.toggleSpotlightLike(postId);
  }

  submitComment(postId: string) {
    const result = this.arena.addSpotlightComment(postId, this.comments[postId] || '');
    if (result?.ok) this.comments[postId] = '';
  }

  getUserName(userId: string) {
    return this.arena.getUser(userId)?.username || 'Player';
  }
}
