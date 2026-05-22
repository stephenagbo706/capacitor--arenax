import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgForOf } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { NotificationItem } from '../../core/models/arena.models';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [IonContent, AsyncPipe, NgForOf, DatePipe],
  templateUrl: './notifications.page.html',
  styleUrls: ['./notifications.page.scss'],
})
export class NotificationsPage {
  private arena = inject(ArenaService);
  private router = inject(Router);

  notifications$ = this.arena.notifications$;

  markRead(id: string) {
    this.arena.markNotificationRead(id);
  }

  openNotification(note: NotificationItem) {
    this.arena.markNotificationRead(note.id);

    if (note.type === 'chat') {
      if (note.chatId) {
        this.router.navigate(['/chat', note.chatId]);
        return;
      }
      this.router.navigate(['/chat']);
      return;
    }

    if (note.type === 'tournament') {
      this.router.navigate(['/tournaments']);
      return;
    }

    if (note.type === 'spotlight') {
      this.router.navigate(['/spotlight']);
      return;
    }

    if (note.type === 'match' || note.type === 'challenge') {
      this.router.navigate(['/matches']);
      return;
    }

    this.router.navigate(['/notifications']);
  }
}
