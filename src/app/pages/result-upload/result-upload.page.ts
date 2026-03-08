import { Component } from '@angular/core';
import { AsyncPipe, NgForOf, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { timer } from 'rxjs';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-result-upload',
  standalone: true,
  imports: [IonContent, FormsModule, NgIf, NgForOf, AsyncPipe],
  templateUrl: './result-upload.page.html',
  styleUrls: ['./result-upload.page.scss'],
})
export class ResultUploadPage {
  matchId = '';
  winnerId = '';
  screenshotDataUrl = '';
  screenshotFileName = '';
  screenshotMimeType = '';
  screenshotSize = 0;
  error = '';
  clock$ = timer(0, 1000);

  constructor(private route: ActivatedRoute, private arena: ArenaService, private router: Router) {
    this.matchId = this.route.snapshot.paramMap.get('id') || '';
    const match = this.match;
    this.winnerId = match?.player1Id || this.arena.getCurrentUser()?.id || '';
  }

  get match() {
    return this.arena.matches$.value.find((item) => item.id === this.matchId);
  }

  get matchPlayers() {
    if (!this.match) return [];
    return [this.match.player1Id, this.match.player2Id]
      .filter((id): id is string => Boolean(id))
      .map((id) => this.arena.getUser(id))
      .filter((player): player is NonNullable<typeof player> => Boolean(player));
  }

  getPlayerGameId(playerId: string) {
    const player = this.arena.getUser(playerId);
    if (!player || !this.match) return 'N/A';
    const game = this.match.game.toLowerCase();
    if (game.includes('dream')) return player.gameIds['Dream League Soccer'];
    if (game.includes('call of duty') || game.includes('cod')) return player.gameIds['Call of Duty Mobile'];
    if (game.includes('efootball')) return player.gameIds.eFootball;
    return player.gameIds.FIFA;
  }

  getMatchIconPath(gameName: string | undefined) {
    const game = (gameName || '').toLowerCase();
    if (game.includes('dream')) return 'assets/match-icons/dream-league-soccer.jpg';
    if (game.includes('call of duty') || game.includes('cod')) return 'assets/match-icons/call-of-duty.jpg';
    if (game.includes('efootball')) return 'assets/match-icons/efootball.jpg';
    return 'assets/match-icons/fifa-mobile.jpg';
  }

  submit() {
    if (this.isUploadLocked) {
      this.error = `You can upload only when match time is complete. Time left: ${this.uploadLockTimeLeft}.`;
      return;
    }
    if (!this.winnerId || !this.matchId) {
      this.error = 'Winner and match are required.';
      return;
    }
    if (this.match?.status !== 'live') {
      this.error = 'Only LIVE matches can submit results.';
      return;
    }
    if (!this.screenshotDataUrl || !this.screenshotFileName || !this.screenshotMimeType || !this.screenshotSize) {
      this.error = 'Please choose a screenshot from your device.';
      return;
    }

    const uploadResult = this.arena.uploadMatchScreenshot(this.matchId, {
      winnerId: this.winnerId,
      fileName: this.screenshotFileName,
      mimeType: this.screenshotMimeType,
      size: this.screenshotSize,
      dataUrl: this.screenshotDataUrl,
    });
    if (!uploadResult?.ok) {
      this.error = uploadResult?.message || 'Could not upload screenshot.';
      return;
    }

    const verifyResult = this.arena.autoVerifyPendingMatch(this.matchId);
    if (!verifyResult?.ok) {
      this.error = verifyResult?.message || 'Could not verify match automatically.';
      return;
    }

    this.error = '';
    this.router.navigateByUrl('/matches');
  }

  onScreenshotSelected(event: Event) {
    if (this.isUploadLocked) {
      this.error = `Upload is locked until match ends. Time left: ${this.uploadLockTimeLeft}.`;
      return;
    }

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      this.error = 'Only PNG or JPG screenshots are allowed.';
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.error = 'Screenshot must be 5MB or less.';
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) {
        this.error = 'Could not read screenshot file.';
        return;
      }
      this.error = '';
      this.screenshotDataUrl = dataUrl;
      this.screenshotFileName = file.name;
      this.screenshotMimeType = file.type;
      this.screenshotSize = file.size;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  get isUploadLocked() {
    const match = this.match;
    if (!match) return true;
    const durationMinutes = typeof match.duration === 'number' ? match.duration : 10;
    const totalSeconds = Math.max(0, Math.round(durationMinutes * 60));
    const startedAtMs = Date.parse(match.startedAt || match.createdAt);
    if (Number.isNaN(startedAtMs)) return true;

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    return elapsedSeconds < totalSeconds;
  }

  get uploadLockTimeLeft() {
    const match = this.match;
    if (!match) return '00:00';
    const durationMinutes = typeof match.duration === 'number' ? match.duration : 10;
    const totalSeconds = Math.max(0, Math.round(durationMinutes * 60));
    const startedAtMs = Date.parse(match.startedAt || match.createdAt);
    if (Number.isNaN(startedAtMs)) return this.formatClock(totalSeconds);

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    const remaining = Math.max(0, totalSeconds - elapsedSeconds);
    return this.formatClock(remaining);
  }

  private formatClock(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
