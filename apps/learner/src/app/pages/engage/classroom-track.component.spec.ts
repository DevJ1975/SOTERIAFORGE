import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { Track } from 'livekit-client';
import { ClassroomTrackComponent } from './classroom-track.component';

function fakeTrack(kind: 'video' | 'audio') {
  const elements: HTMLMediaElement[] = [];
  const track = {
    // LiveKit hands out a fresh element on every attach().
    attach: jest.fn(() => {
      const element = document.createElement(kind);
      elements.push(element);
      return element;
    }),
    detach: jest.fn(),
  };
  return { track: track as unknown as Track, mock: track, elements };
}

@Component({
  standalone: true,
  imports: [ClassroomTrackComponent],
  template: '<assurance-classroom-track [track]="track()" [muted]="muted()" />',
})
class HostComponent {
  readonly track = signal<Track | undefined>(undefined);
  readonly muted = signal(false);
}

describe('ClassroomTrackComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const media = () =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('video, audio'));

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('renders nothing until it has a track', async () => {
    await settle();
    expect(media()).toHaveLength(0);
  });

  it('attaches a video track inline and muted so Chrome autoplays it', async () => {
    const { track, mock, elements } = fakeTrack('video');
    host.track.set(track);
    host.muted.set(true);
    await settle();
    expect(mock.attach).toHaveBeenCalledTimes(1);
    expect(media()).toEqual([elements[0]]);
    const video = elements[0] as HTMLVideoElement;
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
  });

  it('leaves audio unmuted so remote participants can be heard', async () => {
    const { track, elements } = fakeTrack('audio');
    host.track.set(track);
    await settle();
    expect(elements[0].muted).toBe(false);
    expect(media()).toEqual([elements[0]]);
  });

  it('swaps tracks without leaving the old element behind', async () => {
    const first = fakeTrack('video');
    const second = fakeTrack('video');
    host.track.set(first.track);
    await settle();
    host.track.set(second.track);
    await settle();
    expect(first.mock.detach).toHaveBeenCalledWith(first.elements[0]);
    expect(media()).toEqual([second.elements[0]]);
  });

  it('re-attaches once, not twice, when only the muted flag changes', async () => {
    const { track, mock } = fakeTrack('video');
    host.track.set(track);
    await settle();
    host.muted.set(true);
    await settle();
    expect(mock.attach).toHaveBeenCalledTimes(2);
    expect(mock.detach).toHaveBeenCalledTimes(1);
    expect(media()).toHaveLength(1);
  });

  it('detaches and removes the element when the track goes away', async () => {
    const { track, mock } = fakeTrack('video');
    host.track.set(track);
    await settle();
    host.track.set(undefined);
    await settle();
    expect(mock.detach).toHaveBeenCalledTimes(1);
    expect(media()).toHaveLength(0);
  });

  it('releases the media element when the tile is destroyed', async () => {
    const { track, mock, elements } = fakeTrack('video');
    host.track.set(track);
    await settle();
    fixture.destroy();
    expect(mock.detach).toHaveBeenCalledWith(elements[0]);
    expect(elements[0].isConnected).toBe(false);
  });
});
