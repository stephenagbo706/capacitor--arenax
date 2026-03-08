import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, NgFor, NgIf],
})
export class HomePage {
  activeScreen: 'scr-login' | 'scr-home' | 'scr-create' | 'scr-tournaments' | 'scr-wallet' | 'scr-profile' = 'scr-login';
  activeGameIndex = 0;
  extraTime = true;
  penalties = true;
  matchDuration = 10;
  stakeAmount = 25;
  selectedPlatform: 'PlayStation' | 'Xbox' | 'PC' = 'PlayStation';
  activeTournamentFilter: 'All' | 'Live' | 'Upcoming' | 'Ended' = 'All';
  profileImageSrc = this.loadProfileImage();
  createError = '';

  activeMatches: Array<{ stake: number; label: string; timer: string; icon: string }> = [
    { stake: 50, label: 'FIFA 24', timer: '00:45:32', icon: 'fa-solid fa-futbol' },
    { stake: 20, label: 'Call of Duty', timer: '01:12:10', icon: 'fa-solid fa-gamepad' },
  ];

  private readonly profileImageKey = 'arenax_profile_image';

  setScreen(screen: HomePage['activeScreen']) {
    this.activeScreen = screen;
  }

  selectGame(index: number) {
    this.activeGameIndex = index;
  }

  toggleExtraTime() {
    this.extraTime = !this.extraTime;
  }

  togglePenalties() {
    this.penalties = !this.penalties;
  }

  setMatchDuration(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isNaN(value)) this.matchDuration = value;
  }

  setStakeAmount(event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.stakeAmount = Math.max(0, Math.round(value * 100) / 100);
  }

  selectPlatform(platform: HomePage['selectedPlatform']) {
    this.selectedPlatform = platform;
  }

  setTournamentFilter(filter: HomePage['activeTournamentFilter']) {
    this.activeTournamentFilter = filter;
  }

  createStakeMatch() {
    this.createError = '';

    if (this.stakeAmount <= 0 || Number.isNaN(this.stakeAmount)) {
      this.createError = 'Enter a valid stake amount.';
      return;
    }

    const stake = Math.round(this.stakeAmount * 100) / 100;
    const gameLabel = this.selectedGameTitle;
    const icon = this.selectedGameIcon;

    this.activeMatches = [
      { stake, label: `${gameLabel} · ${this.selectedPlatform}`, timer: '00:00:00', icon },
      ...this.activeMatches,
    ].slice(0, 4);

    this.activeScreen = 'scr-home';
  }

  onProfileImageSelected(event: Event) {
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
      this.profileImageSrc = result;
      localStorage.setItem(this.profileImageKey, result);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  openEditProfile() {
    alert('Open edit profile screen.');
  }

  openBadgeDetails(badgeName: string) {
    alert(`Open badge details: ${badgeName}`);
  }

  openRankingLeaderboard() {
    alert('Open ranking leaderboard.');
  }

  private loadProfileImage() {
    return localStorage.getItem(this.profileImageKey) || 'assets/ax-ui/logo.png';
  }

  get selectedGameTitle() {
    const games = ['FIFA 24', 'Call of Duty', 'NBA 2K24'];
    return games[this.activeGameIndex] || games[0];
  }

  get selectedGameIcon() {
    const icons = ['fa-solid fa-futbol', 'fa-solid fa-gamepad', 'fa-solid fa-basketball'];
    return icons[this.activeGameIndex] || icons[0];
  }

  get selectedGameImage() {
    const images = ['assets/ax-ui/tournament-area.jpg', 'assets/ax-ui/summit-section.jpg', 'assets/ax-ui/wel.jpg'];
    return images[this.activeGameIndex] || images[0];
  }
}
