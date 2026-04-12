import { Component, OnDestroy } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';
import { NotificationItem } from './core/models/arena.models';
import { ArenaService } from './core/services/arena.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonApp, IonRouterOutlet, NgIf],
})
export class AppComponent implements OnDestroy {
  chatPopup: NotificationItem | null = null;
  private readonly seenNotificationIds = new Set<string>();
  private readonly notificationsSub: Subscription;
  private hidePopupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private arena: ArenaService, private auth: AuthService, private router: Router) {
    void this.auth.waitUntilReady();
    this.notificationsSub = this.arena.notifications$.subscribe((notifications) => {
      const incoming = notifications.find(
        (note) => note.type === 'chat' && !note.read && !this.seenNotificationIds.has(note.id)
      );
      if (!incoming) return;
      this.seenNotificationIds.add(incoming.id);
      this.chatPopup = incoming;
      if (this.hidePopupTimer) clearTimeout(this.hidePopupTimer);
      this.hidePopupTimer = setTimeout(() => {
        this.chatPopup = null;
      }, 5000);
    });
  }

  openChatNotification() {
    if (!this.chatPopup) return;
    const targetChatId = this.chatPopup.chatId;
    this.arena.markNotificationRead(this.chatPopup.id);
    this.chatPopup = null;
    if (targetChatId) {
      this.router.navigate(['/chat', targetChatId]);
      return;
    }
    this.router.navigate(['/notifications']);
  }

  dismissChatPopup() {
    this.chatPopup = null;
  }

  ngOnDestroy() {
    this.notificationsSub.unsubscribe();
    if (this.hidePopupTimer) clearTimeout(this.hidePopupTimer);
  }
}
