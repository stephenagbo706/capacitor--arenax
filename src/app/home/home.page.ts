import { Component } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonContent, NgFor, NgIf, RouterLink],
})
export class HomePage {
  activeScreen: 'scr-login' | 'scr-home' | 'scr-create' | 'scr-tournaments' | 'scr-wallet' | 'scr-profile' | 'scr-admin' =
    'scr-login';
  activeGameIndex = 0;
  extraTime = true;
  penalties = true;
  matchDuration = 10;
  stakeAmount = 0;
  selectedPlatform: 'PlayStation' | 'Xbox' | 'PC' = 'PlayStation';
  activeTournamentFilter: 'All' | 'Live' | 'Upcoming' | 'Ended' = 'All';
  stakeCurrency: 'NGN' | 'USD' = 'USD';
  adminFilter: 'All' | 'Pending' | 'Disputed' | 'Escrow' = 'All';
  profileImageSrc = this.loadProfileImage();
  createError = '';
  nairaBalance = 0;
  usdBalance = 0;
  preferredCurrency: 'NGN' | 'USD' = this.loadPreferredCurrency();

  activeMatches: Array<{ stake: number; label: string; timer: string; icon: string }> = [
    { stake: 50, label: 'FIFA 24', timer: '00:45:32', icon: 'fa-solid fa-futbol' },
    { stake: 20, label: 'Call of Duty', timer: '01:12:10', icon: 'fa-solid fa-gamepad' },
  ];
  adminQueue: Array<{
    id: string;
    game: string;
    type: 'Result Review' | 'Dispute' | 'Escrow Release';
    amount: number;
    currency: 'USD' | 'NGN';
    openedAgo: string;
    priority: 'High' | 'Medium' | 'Low';
    status: 'Pending' | 'Disputed' | 'Escrow' | 'Resolved';
  }> = [
    {
      id: 'AX-4821',
      game: 'FIFA 24',
      type: 'Result Review',
      amount: 120,
      currency: 'USD',
      openedAgo: '8 min ago',
      priority: 'High',
      status: 'Pending',
    },
    {
      id: 'AX-4812',
      game: 'Call of Duty',
      type: 'Dispute',
      amount: 75,
      currency: 'USD',
      openedAgo: '22 min ago',
      priority: 'High',
      status: 'Disputed',
    },
    {
      id: 'AX-4764',
      game: 'NBA 2K24',
      type: 'Escrow Release',
      amount: 65000,
      currency: 'NGN',
      openedAgo: '45 min ago',
      priority: 'Medium',
      status: 'Escrow',
    },
    {
      id: 'AX-4699',
      game: 'eFootball',
      type: 'Result Review',
      amount: 40,
      currency: 'USD',
      openedAgo: '1 hr ago',
      priority: 'Low',
      status: 'Pending',
    },
  ];
  moderationFeed: Array<{ time: string; event: string; actor: string }> = [
    { time: '2m', event: 'Result verified for AX-4818', actor: 'Admin Rex' },
    { time: '9m', event: 'Escrow released to winner (AX-4803)', actor: 'System' },
    { time: '17m', event: 'Dispute escalated to video review (AX-4791)', actor: 'Admin Nova' },
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

  setStakeCurrency(currency: HomePage['stakeCurrency']) {
    this.stakeCurrency = currency;
  }

  setTournamentFilter(filter: HomePage['activeTournamentFilter']) {
    this.activeTournamentFilter = filter;
  }

  setAdminFilter(filter: HomePage['adminFilter']) {
    this.adminFilter = filter;
  }

  markAdminItemResolved(itemId: string) {
    this.adminQueue = this.adminQueue.map((item) => (item.id === itemId ? { ...item, status: 'Resolved' } : item));
  }

  escalateAdminItem(itemId: string) {
    this.adminQueue = this.adminQueue.map((item) =>
      item.id === itemId ? { ...item, status: 'Disputed', priority: 'High' } : item
    );
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

  setPreferredCurrency(currency: HomePage['preferredCurrency']) {
    this.preferredCurrency = currency;
    localStorage.setItem('ax-preferred-currency', currency);
  }

  private loadPreferredCurrency(): HomePage['preferredCurrency'] {
    const saved = localStorage.getItem('ax-preferred-currency');
    return saved === 'USD' ? 'USD' : 'NGN';
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

  get adminItemsInView() {
    return this.adminQueue.filter((item) => {
      if (item.status === 'Resolved') return false;
      if (this.adminFilter === 'All') return true;
      return item.status === this.adminFilter;
    });
  }

  get adminPendingCount() {
    return this.adminQueue.filter((item) => item.status === 'Pending').length;
  }

  get adminDisputeCount() {
    return this.adminQueue.filter((item) => item.status === 'Disputed').length;
  }

  get adminEscrowCount() {
    return this.adminQueue.filter((item) => item.status === 'Escrow').length;
  }

  get adminEscrowTotalUsd() {
    return this.adminQueue
      .filter((item) => item.status === 'Escrow' && item.currency === 'USD')
      .reduce((sum, item) => sum + item.amount, 0);
  }

  formatAdminAmount(item: HomePage['adminQueue'][number]) {
    return item.currency === 'USD' ? `$${item.amount.toFixed(2)}` : `₦${item.amount.toLocaleString()}`;
  }
}
