/**
 * Angular standalone wrapper for the PERIL! Phaser game.
 * The Phaser game is created outside the NgZone so its 60fps loop never
 * triggers change detection, and destroyed cleanly with the component.
 */

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import Phaser from 'phaser';
import { PerilAudio } from './audio';
import { GAME_HEIGHT, GAME_WIDTH, REGISTRY_KEYS } from './scenes/theme';
import { LobbyScene } from './scenes/lobby-scene';
import { BoardScene } from './scenes/board-scene';
import { ClueScene } from './scenes/clue-scene';
import { FinalScene } from './scenes/final-scene';
import { ResultsScene } from './scenes/results-scene';

@Component({
  selector: 'forge-peril',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="peril-shell">
      <div class="peril-toolbar">
        <span class="peril-title">PERIL! &mdash; The Workplace Safety Game Show</span>
        <button
          type="button"
          class="peril-mute"
          (click)="toggleMute()"
          [attr.aria-pressed]="muted"
          [attr.aria-label]="muted ? 'Unmute game audio' : 'Mute game audio'"
        >
          {{ muted ? '🔇 Sound off' : '🔊 Sound on' }}
        </button>
      </div>
      <div #gameHost class="peril-stage"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        font-family: var(--forge-font, adobe-clean, 'Source Sans Pro', sans-serif);
      }
      .peril-shell {
        background: var(--forge-surface, #ffffff);
        color: var(--forge-text, #2c2c2c);
        border-radius: var(--forge-radius, 8px);
        overflow: hidden;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
      }
      .peril-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 16px;
        background: var(--forge-surface, #ffffff);
        border-bottom: 2px solid var(--forge-accent, #1473e6);
      }
      .peril-title {
        font-weight: 700;
        letter-spacing: 0.04em;
      }
      .peril-mute {
        font: inherit;
        color: var(--forge-text, #2c2c2c);
        background: transparent;
        border: 1px solid var(--forge-accent, #1473e6);
        border-radius: var(--forge-radius, 8px);
        padding: 6px 14px;
        cursor: pointer;
      }
      .peril-mute:hover {
        background: var(--forge-accent, #1473e6);
        color: #ffffff;
      }
      .peril-stage {
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #02034d;
      }
      .peril-stage canvas {
        display: block;
        margin: 0 auto;
      }
    `,
  ],
})
export class PerilComponent implements AfterViewInit, OnDestroy {
  @ViewChild('gameHost', { static: true })
  private gameHost!: ElementRef<HTMLDivElement>;

  muted = false;

  private game: Phaser.Game | null = null;
  private audio: PerilAudio | null = null;
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.audio = new PerilAudio();
      this.game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: this.gameHost.nativeElement,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        backgroundColor: '#02034d',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [LobbyScene, BoardScene, ClueScene, FinalScene, ResultsScene],
      });
      this.game.registry.set(REGISTRY_KEYS.audio, this.audio);
    });
  }

  toggleMute(): void {
    if (!this.audio) return;
    this.muted = this.audio.toggleMute();
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.zone.runOutsideAngular(() => {
      this.audio?.dispose();
      this.audio = null;
      this.game?.destroy(true);
      this.game = null;
    });
  }
}
