import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { Subscription } from 'rxjs';
import { NotificationItem } from './core/models/arena.models';
import { ArenaService } from './core/services/arena.service';
import { AuthService } from './core/services/auth.service';
import { ArenaPermissionItem, PermissionService } from './core/services/permission.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonApp, IonRouterOutlet, NgFor, NgIf],
})
export class AppComponent implements OnDestroy, OnInit {
  private arena = inject(ArenaService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private permissions = inject(PermissionService);

  chatPopup: NotificationItem | null = null;
  permissionOnboardingOpen = false;
  permissionItems: ArenaPermissionItem[] = [];
  permissionBusyKey = '';
  permissionMessage = '';
  showStartupLoading = true;
  private readonly seenNotificationIds = new Set<string>();
  private readonly permissionOnboardingKey = 'arenax_android_permission_onboarding_seen';
  private readonly notificationsSub: Subscription;
  private hidePopupTimer: ReturnType<typeof setTimeout> | null = null;
  private startupLoadingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.auth.waitUntilReady();
    this.startupLoadingTimer = setTimeout(() => {
      this.showStartupLoading = false;
    }, 4000);
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

  async ngOnInit() {
    if (Capacitor.getPlatform() !== 'android') return;
    this.permissionItems = await this.permissions.getPermissionItems();
    const hasPromptablePermission = this.permissionItems.some((item) => item.canRequest && item.state !== 'granted');
    this.permissionOnboardingOpen = hasPromptablePermission && localStorage.getItem(this.permissionOnboardingKey) !== 'true';
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

  async requestOnboardingPermission(item: ArenaPermissionItem) {
    this.permissionBusyKey = item.key;
    this.permissionMessage = '';
    await this.permissions.tap();
    const result = await this.permissions.requestPermission(item.key);
    this.permissionItems = await this.permissions.getPermissionItems();
    this.permissionMessage = result.message || '';
    this.permissionBusyKey = '';
  }

  async openPermissionSettings() {
    this.permissionBusyKey = 'settings';
    const result = await this.permissions.openAppSettings();
    this.permissionMessage = result.message || '';
    this.permissionBusyKey = '';
  }

  dismissPermissionOnboarding() {
    localStorage.setItem(this.permissionOnboardingKey, 'true');
    this.permissionOnboardingOpen = false;
  }

  ngOnDestroy() {
    this.notificationsSub.unsubscribe();
    if (this.hidePopupTimer) clearTimeout(this.hidePopupTimer);
    if (this.startupLoadingTimer) clearTimeout(this.startupLoadingTimer);
  }
}
