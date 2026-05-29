/**
 * PhaserHostComponent
 *
 * Hosts a Phaser.Game instance inside an Angular standalone component.
 * Phaser is loaded lazily (dynamic import) so it never executes during SSR
 * and does not block the initial bundle.
 *
 * Intended to be @defer-loaded by host apps.
 */

import {
  AfterNextRenderRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CardGameConfig } from './card-game.model';

@Component({
  selector: 'forge-phaser-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #gameContainer
      class="phaser-container"
      [attr.aria-label]="config()?.title ?? 'Card game'"
    ></div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .phaser-container {
        width: 100%;
        aspect-ratio: 4 / 3;
        background: #1a1a2e;
        border-radius: 8px;
        overflow: hidden;
      }
    `,
  ],
})
export class PhaserHostComponent implements OnDestroy {
  // ---- Inputs / Outputs -------------------------------------------------------

  readonly config = input.required<CardGameConfig>();

  /** Emits when the game session is completed (e.g., all cards matched). */
  readonly completed = output<void>();

  // ---- Private state ----------------------------------------------------------

  @ViewChild('gameContainer', { static: true })
  private readonly gameContainer!: ElementRef<HTMLDivElement>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private game: any = null;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
  private afterRenderRef: AfterNextRenderRef | null = null;

  // ---- Lifecycle --------------------------------------------------------------

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.afterRenderRef = afterNextRender(
        () => {
          this.initPhaser();
        },
        { injector: this.injector },
      );
    }
  }

  ngOnDestroy(): void {
    this.afterRenderRef?.destroy();
    this.destroyGame();
  }

  // ---- Helpers ----------------------------------------------------------------

  private async initPhaser(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PhaserMod: any = await import('phaser');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Phaser: any = PhaserMod.default ?? PhaserMod;

    const cfg = this.config();
    const title = cfg.title ?? 'Card Game';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const cardCount: number =
      cfg.kind === 'flip_reveal'
        ? cfg.cards.length
        : cfg.kind === 'match_pairs'
          ? cfg.pairs.length
          : cfg.kind === 'sort_buckets'
            ? cfg.cards.length
            : cfg.scenarios.length;

    const completedOutput = this.completed;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    class CardScene extends (Phaser.Scene as any) {
      constructor() {
        super({ key: 'CardScene' });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create(this: any): void {
        const { width, height } = this.scale;
        // Background
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.add
          .rectangle(width / 2, height / 2, width, height, 0x1a1a2e)
          .setDepth(0);

        // Title text
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.add
          .text(width / 2, height * 0.35, title, {
            fontSize: '24px',
            color: '#ffffff',
            fontStyle: 'bold',
          })
          .setOrigin(0.5);

        // Card count label
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.add
          .text(width / 2, height * 0.55, `${cardCount} card${cardCount !== 1 ? 's' : ''}`, {
            fontSize: '18px',
            color: '#aaaacc',
          })
          .setOrigin(0.5);

        // Simple "Complete" button for demo purposes
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const btn = this.add
          .text(width / 2, height * 0.72, '[ Play ]', {
            fontSize: '20px',
            color: '#66ccff',
            backgroundColor: '#223366',
            padding: { x: 16, y: 8 },
          })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        btn.on('pointerup', () => {
          completedOutput.emit();
        });
      }
    }

    const container = this.gameContainer.nativeElement;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || 640,
      height: container.clientHeight || 480,
      backgroundColor: '#1a1a2e',
      scene: [CardScene],
      // Disable audio context to avoid jsdom issues in test environments
      audio: { noAudio: true },
    });
  }

  private destroyGame(): void {
    if (this.game) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.game.destroy(true);
      this.game = null;
    }
  }
}
