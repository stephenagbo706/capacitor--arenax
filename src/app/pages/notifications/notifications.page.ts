import { Component, inject } from '@angular/core';
import { AsyncPipe, DatePipe, NgForOf } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
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

  notifications$ = this.arena.notifications$;

  markRead(id: string) {
    this.arena.markNotificationRead(id);
  }
}
