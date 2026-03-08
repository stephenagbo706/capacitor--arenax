import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'ax-bottom-nav',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="ax-bottom-nav" aria-label="Primary">
      <a routerLink="/home" [class.active]="isActive('/home')" aria-label="Home">
        <i class="fa-solid fa-house"></i>
      </a>
      <a routerLink="/spotlight" [class.active]="isActive('/spotlight')" aria-label="Spotlight">
        <i class="fa-regular fa-newspaper"></i>
      </a>
      <a
        routerLink="/matches"
        class="plus"
        [class.active]="isActive('/matches') || isActive('/find-players')"
        aria-label="Create Match"
      >
        <i class="fa-solid fa-plus"></i>
      </a>
      <a routerLink="/wallet" [class.active]="isActive('/wallet')" aria-label="Wallet">
        <i class="fa-solid fa-wallet"></i>
      </a>
      <a routerLink="/profile" [class.active]="isActive('/profile')" aria-label="Profile">
        <i class="fa-solid fa-user"></i>
      </a>
    </nav>
  `,
})
export class BottomNavComponent {
  constructor(private router: Router) {}

  isActive(path: string) {
    return this.router.url.startsWith(path);
  }
}
