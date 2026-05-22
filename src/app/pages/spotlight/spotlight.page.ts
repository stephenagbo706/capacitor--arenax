import { Component, inject } from '@angular/core';
import { AsyncPipe, NgForOf, NgIf, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular/standalone';
import { SpotlightComment } from '../../core/models/arena.models';
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
  private arena = inject(ArenaService);

  spotlightPosts$ = this.arena.spotlightPosts$;
  comments: Record<string, string> = {};

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

  get currentUserId() {
    return this.arena.getCurrentUser()?.id || '';
  }

  canDeleteComment(comment: SpotlightComment) {
    return comment.userId === this.currentUserId;
  }

  hasReacted(comment: SpotlightComment) {
    return (comment.reactionUserIds || []).includes(this.currentUserId);
  }

  toggleCommentReaction(postId: string, commentId: string) {
    this.arena.toggleSpotlightCommentReaction(postId, commentId);
  }

  deleteComment(postId: string, commentId: string) {
    this.arena.deleteSpotlightComment(postId, commentId);
  }
}
