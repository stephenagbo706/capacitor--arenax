import { Component } from '@angular/core';
import { DatePipe, NgForOf } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { BottomNavComponent } from '../../shared/bottom-nav.component';

interface TimelineItem {
  phase: string;
  start: string;
  end: string;
  event: string;
}

@Component({
  selector: 'app-weekly-event-timeline',
  standalone: true,
  imports: [IonContent, NgForOf, DatePipe, BottomNavComponent],
  templateUrl: './weekly-event-timeline.page.html',
  styleUrls: ['./weekly-event-timeline.page.scss'],
})
export class WeeklyEventTimelinePage {
  readonly timeline: TimelineItem[] = [
    { phase: 'Qualification', start: '2026-01-10', end: '2026-01-12', event: 'Registration Opens & Team Setup' },
    { phase: 'Qualification', start: '2026-01-15', end: '2026-01-18', event: 'Qualifier Matches (Round 1)' },
    { phase: 'Qualification', start: '2026-01-20', end: '2026-01-22', event: 'Qualifier Matches (Round 2)' },
    { phase: 'Qualification', start: '2026-01-25', end: '2026-01-25', event: 'Qualified Teams Announcement' },
    { phase: 'Group Stage', start: '2026-02-03', end: '2026-02-06', event: 'Group Stage Matchday 1' },
    { phase: 'Group Stage', start: '2026-02-10', end: '2026-02-13', event: 'Group Stage Matchday 2' },
    { phase: 'Group Stage', start: '2026-02-17', end: '2026-02-20', event: 'Group Stage Matchday 3' },
    { phase: 'Group Stage', start: '2026-02-24', end: '2026-02-26', event: 'Knockout Qualification Check' },
    { phase: 'Knockout', start: '2026-03-04', end: '2026-03-07', event: 'Round of 16' },
    { phase: 'Knockout', start: '2026-03-10', end: '2026-03-13', event: 'Quarter Finals' },
    { phase: 'Knockout', start: '2026-03-17', end: '2026-03-19', event: 'Semi Finals' },
    { phase: 'Knockout', start: '2026-03-23', end: '2026-03-23', event: 'Final Match Setup' },
    { phase: 'Knockout', start: '2026-03-25', end: '2026-03-25', event: 'GRAND FINAL' },
    { phase: 'Final Showcase', start: '2026-04-05', end: '2026-04-05', event: 'Champions Showcase Match' },
    { phase: 'Final Showcase', start: '2026-04-12', end: '2026-04-13', event: 'All-Star Exhibition Games' },
    { phase: 'Final Showcase', start: '2026-04-20', end: '2026-04-20', event: 'Season Awards Ceremony' },
  ];
}
