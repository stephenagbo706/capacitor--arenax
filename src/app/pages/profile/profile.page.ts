import { Component } from '@angular/core';
import { AsyncPipe, CommonModule, DecimalPipe, NgForOf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { ArenaService } from '../../core/services/arena.service';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, IonContent, AsyncPipe, NgForOf, DecimalPipe, RouterLink, BottomNavComponent],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage {
  user$ = this.arena.currentUser$;
  matches$ = this.arena.matches$;

  constructor(private arena: ArenaService) {}
}
