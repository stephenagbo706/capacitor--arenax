import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [IonContent, FormsModule],
  templateUrl: './edit-profile.page.html',
  styleUrls: ['./edit-profile.page.scss'],
})
export class EditProfilePage {
  username = '';
  avatar = '';
  avatarPreview = '';
  efootballId = '';
  dlsId = '';
  fifaId = '';
  codmId = '';

  constructor(private arena: ArenaService, private router: Router) {
    const user = this.arena.getCurrentUser();
    if (user) {
      this.username = user.username;
      this.avatar = user.avatar;
      this.avatarPreview = user.avatar;
      this.efootballId = user.gameIds.eFootball;
      this.dlsId = user.gameIds['Dream League Soccer'];
      this.fifaId = user.gameIds.FIFA;
      this.codmId = user.gameIds['Call of Duty Mobile'];
    }
  }

  onAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      input.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Please choose an image under 2 MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      this.avatar = result;
      this.avatarPreview = result;
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  save() {
    this.arena.updateProfile({
      username: this.username,
      avatar: this.avatarPreview || this.avatar,
      gameIds: {
        eFootball: this.efootballId,
        'Dream League Soccer': this.dlsId,
        FIFA: this.fifaId,
        'Call of Duty Mobile': this.codmId,
      },
      gameId: this.fifaId,
    });
    this.router.navigateByUrl('/profile');
  }
}
