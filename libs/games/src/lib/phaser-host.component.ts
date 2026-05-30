/**
 * PhaserHostComponent
 *
 * Hosts a Phaser.Game instance inside an Angular standalone component.
 * Phaser is loaded lazily (dynamic import) so it never executes during SSR
 * and does not block the initial bundle.
 *
 * Supports four CardGameConfig kinds:
 *  - flip_reveal:     Cards face-down; click to flip; complete when all revealed.
 *  - match_pairs:     Shuffled pairs; click two matching cards; complete when all matched.
 *  - sort_buckets:    Click a card to assign it to the next bucket; complete when all handled.
 *  - scenario_cards:  Read prompt, click a choice; complete when all scenarios handled.
 *
 * Intended to be @defer-loaded by host apps.
 */

import {
  AfterRenderRef,
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
import type {
  CardGameConfig,
  FlipRevealConfig,
  MatchPairsConfig,
  ScenarioCardsConfig,
  SortBucketsConfig,
} from './card-game.model';

@Component({
  selector: 'assurance-phaser-host',
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
  private afterRenderRef: AfterRenderRef | null = null;

  // ---- Lifecycle --------------------------------------------------------------

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.afterRenderRef = afterNextRender(
        () => {
          void this.initPhaser();
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

    // Guard: Phaser requires a real canvas context. In jsdom (Jest) canvas is
    // not implemented — skip initialisation to keep tests fast and SSR-safe.
    const testCanvas = document.createElement('canvas');
    if (typeof testCanvas.getContext !== 'function' || testCanvas.getContext('2d') === null) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PhaserMod: any = await import('phaser');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Phaser: any = PhaserMod.default ?? PhaserMod;

    const cfg = this.config();
    const completedOutput = this.completed;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let SceneClass: any;

    switch (cfg.kind) {
      case 'flip_reveal':
        SceneClass = buildFlipRevealScene(Phaser, cfg, completedOutput);
        break;
      case 'match_pairs':
        SceneClass = buildMatchPairsScene(Phaser, cfg, completedOutput);
        break;
      case 'sort_buckets':
        SceneClass = buildSortBucketsScene(Phaser, cfg, completedOutput);
        break;
      case 'scenario_cards':
        SceneClass = buildScenarioCardsScene(Phaser, cfg, completedOutput);
        break;
    }

    const container = this.gameContainer.nativeElement;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: container.clientWidth || 640,
      height: container.clientHeight || 480,
      backgroundColor: '#1a1a2e',
      scene: [SceneClass],
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

// ---------------------------------------------------------------------------
// Scene builders — each returns a Phaser.Scene subclass.
// All Phaser usage is behind the dynamic-import guard; these functions are
// only called from initPhaser() which is itself browser-only.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFlipRevealScene(Phaser: any, cfg: FlipRevealConfig, done: { emit: () => void }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return class FlipRevealScene extends (Phaser.Scene as any) {
    constructor() {
      super({ key: 'FlipRevealScene' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(this: any): void {
      const { width, height } = this.scale as { width: number; height: number };
      const cards = cfg.cards;
      const total = cards.length;
      let revealed = 0;

      // Title
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.add
        .text(width / 2, 28, cfg.title, {
          fontSize: '20px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      // Progress text
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const progressText = this.add
        .text(width / 2, height - 20, `0 / ${total} revealed`, {
          fontSize: '14px',
          color: '#aaaacc',
        })
        .setOrigin(0.5);

      // Layout cards in a grid
      const cols = Math.min(total, 4);
      const rows = Math.ceil(total / cols);
      const cardW = Math.min(120, (width - 40) / cols);
      const cardH = cardW * 0.7;
      const startX = (width - cols * cardW - (cols - 1) * 8) / 2 + cardW / 2;
      const startY = 60 + cardH / 2;
      const gap = 8;

      cards.forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + gap);
        const y = startY + row * (cardH + gap + 8);

        // Card back (clickable face-down)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const back = this.add
          .rectangle(x, y, cardW, cardH, 0x223366)
          .setStrokeStyle(2, 0x66ccff)
          .setInteractive({ useHandCursor: true });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const backLabel = this.add
          .text(x, y, card.label || '?', {
            fontSize: '13px',
            color: '#aaccff',
            wordWrap: { width: cardW - 8 },
            align: 'center',
          })
          .setOrigin(0.5);

        // Card front (revealed state, hidden initially)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const front = this.add.rectangle(x, y, cardW, cardH, 0x16213e).setStrokeStyle(2, 0x22cc88);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const frontLabel = this.add
          .text(x, y, card.revealText, {
            fontSize: '12px',
            color: '#22cc88',
            wordWrap: { width: cardW - 8 },
            align: 'center',
          })
          .setOrigin(0.5);
        front.setVisible(false);
        frontLabel.setVisible(false);

        let flipped = false;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        back.on('pointerup', () => {
          if (flipped) return;
          flipped = true;
          back.setVisible(false);
          backLabel.setVisible(false);
          front.setVisible(true);
          frontLabel.setVisible(true);
          revealed++;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          progressText.setText(`${revealed} / ${total} revealed`);
          if (revealed === total) {
            done.emit();
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        back.on('pointerover', () => back.setFillStyle(0x334477));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        back.on('pointerout', () => back.setFillStyle(0x223366));

        void rows; // avoid unused variable lint error
      });
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildMatchPairsScene(Phaser: any, cfg: MatchPairsConfig, done: { emit: () => void }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return class MatchPairsScene extends (Phaser.Scene as any) {
    constructor() {
      super({ key: 'MatchPairsScene' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(this: any): void {
      const { width, height } = this.scale as { width: number; height: number };

      // Build flat list of cards: [q, a, q, a, ...]
      type CardItem = { pairId: string; role: 'q' | 'a'; label: string };
      const items: CardItem[] = [];
      cfg.pairs.forEach((p) => {
        items.push({ pairId: p.id, role: 'q', label: p.question.label });
        items.push({ pairId: p.id, role: 'a', label: p.answer.label });
      });

      // Shuffle if requested (default: true)
      const shouldShuffle = cfg.shuffle !== false;
      if (shouldShuffle) {
        for (let i = items.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
      }

      const total = cfg.pairs.length;
      let matched = 0;
      let firstSelected: { pairId: string; rect: unknown; label: unknown } | null = null;

      // Title
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.add
        .text(width / 2, 24, cfg.title, {
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      // Status
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const statusText = this.add
        .text(width / 2, height - 20, `Match pairs: 0 / ${total}`, {
          fontSize: '13px',
          color: '#aaaacc',
        })
        .setOrigin(0.5);

      // Grid
      const cols = Math.min(items.length, 4);
      const rows = Math.ceil(items.length / cols);
      const cardW = Math.min(110, (width - 40) / cols);
      const cardH = 60;
      const gap = 6;
      const startX = (width - cols * (cardW + gap) + gap) / 2 + cardW / 2;
      const startY = 56 + cardH / 2;

      void rows;

      items.forEach((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = startX + col * (cardW + gap);
        const y = startY + row * (cardH + gap);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const rect = this.add
          .rectangle(x, y, cardW, cardH, 0x223366)
          .setStrokeStyle(2, 0x66ccff)
          .setInteractive({ useHandCursor: true });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const lbl = this.add
          .text(x, y, item.label, {
            fontSize: '11px',
            color: '#ccddff',
            wordWrap: { width: cardW - 8 },
            align: 'center',
          })
          .setOrigin(0.5);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        rect.on('pointerup', () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          if (!rect.input?.enabled) return;

          if (!firstSelected) {
            firstSelected = { pairId: item.pairId, rect, label: lbl };
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            rect.setFillStyle(0x335599);
          } else {
            if (firstSelected.pairId === item.pairId && firstSelected.rect !== rect) {
              // Match!
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              (firstSelected.rect as any).setFillStyle(0x115533).setStrokeStyle(2, 0x22cc88);
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              (firstSelected.rect as any).disableInteractive();
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              rect.setFillStyle(0x115533).setStrokeStyle(2, 0x22cc88);
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              rect.disableInteractive();
              matched++;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              statusText.setText(`Match pairs: ${matched} / ${total}`);
              firstSelected = null;
              if (matched === total) {
                done.emit();
              }
            } else {
              // No match — reset selection highlight
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              (firstSelected.rect as any).setFillStyle(0x223366);
              firstSelected = null;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              rect.setFillStyle(0x223366);
            }
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        rect.on('pointerover', () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          if (rect.input?.enabled && rect.fillColor !== 0x335599) rect.setFillStyle(0x2a3d66);
        });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        rect.on('pointerout', () => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          if (rect.input?.enabled && rect.fillColor !== 0x335599) rect.setFillStyle(0x223366);
        });

        void lbl;
      });
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSortBucketsScene(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Phaser: any,
  cfg: SortBucketsConfig,
  done: { emit: () => void },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return class SortBucketsScene extends (Phaser.Scene as any) {
    constructor() {
      super({ key: 'SortBucketsScene' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(this: any): void {
      const { width, height } = this.scale as { width: number; height: number };
      const cards = [...cfg.cards];
      const buckets = cfg.buckets;
      const total = cards.length;
      let handled = 0;
      let bucketIndex = 0;

      // Title
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.add
        .text(width / 2, 24, cfg.title, {
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      // Bucket labels row at bottom
      const bucketW = (width - 32) / buckets.length;
      const bucketY = height - 44;
      buckets.forEach((bucket, bi) => {
        const bx = 16 + bi * bucketW + bucketW / 2;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.add.rectangle(bx, bucketY, bucketW - 4, 36, 0x1a1a40).setStrokeStyle(1, 0x445588);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.add
          .text(bx, bucketY, bucket.label, {
            fontSize: '11px',
            color: '#8899cc',
            wordWrap: { width: bucketW - 12 },
            align: 'center',
          })
          .setOrigin(0.5);
      });

      // Active bucket indicator
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const activeBucketIndicator = this.add
        .text(width / 2, bucketY - 28, `→ ${buckets[0]?.label ?? ''}`, {
          fontSize: '12px',
          color: '#ffcc66',
        })
        .setOrigin(0.5);

      // Status text
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const statusText = this.add
        .text(width / 2, height - 14, `0 / ${total} sorted`, {
          fontSize: '12px',
          color: '#aaaacc',
        })
        .setOrigin(0.5);

      // Current card — show one at a time, center
      let currentIndex = 0;

      const showCard = (): void => {
        if (currentIndex >= cards.length) return;
        const card = cards[currentIndex];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const cardRect = this.add
          .rectangle(width / 2, height / 2 - 20, 180, 100, 0x223366)
          .setStrokeStyle(2, 0x66ccff)
          .setInteractive({ useHandCursor: true });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const cardLbl = this.add
          .text(width / 2, height / 2 - 20, card.label, {
            fontSize: '14px',
            color: '#ccddff',
            wordWrap: { width: 168 },
            align: 'center',
          })
          .setOrigin(0.5);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const hint = this.add
          .text(width / 2, height / 2 + 52, 'Click to sort into bucket', {
            fontSize: '11px',
            color: '#666688',
          })
          .setOrigin(0.5);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        cardRect.on('pointerup', () => {
          cardRect.destroy();
          cardLbl.destroy();
          hint.destroy();

          handled++;
          currentIndex++;
          bucketIndex = (bucketIndex + 1) % buckets.length;

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          statusText.setText(`${handled} / ${total} sorted`);

          if (handled < total) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            activeBucketIndicator.setText(`→ ${buckets[bucketIndex]?.label ?? ''}`);
            showCard();
          } else {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            activeBucketIndicator.setText('All sorted!');
            done.emit();
          }
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        cardRect.on('pointerover', () => cardRect.setFillStyle(0x334477));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        cardRect.on('pointerout', () => cardRect.setFillStyle(0x223366));
      };

      showCard();
    }
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildScenarioCardsScene(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Phaser: any,
  cfg: ScenarioCardsConfig,
  done: { emit: () => void },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return class ScenarioCardsScene extends (Phaser.Scene as any) {
    constructor() {
      super({ key: 'ScenarioCardsScene' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(this: any): void {
      const { width, height } = this.scale as { width: number; height: number };
      const scenarios = cfg.scenarios;
      const total = scenarios.length;
      let scenarioIndex = 0;
      const showFeedback = cfg.showImmediateFeedback !== false;

      // Title
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.add
        .text(width / 2, 22, cfg.title, {
          fontSize: '18px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);

      // Progress text
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const progressText = this.add
        .text(width / 2, height - 14, `Scenario 1 of ${total}`, {
          fontSize: '12px',
          color: '#aaaacc',
        })
        .setOrigin(0.5);

      // Mutable scene objects container — destroyed on each advance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sceneObjects: any[] = [];

      const clearScene = (): void => {
        sceneObjects.forEach((o) => {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          o.destroy();
        });
        sceneObjects.length = 0;
      };

      const showScenario = (idx: number): void => {
        clearScene();

        const scenario = scenarios[idx];
        if (!scenario) return;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        progressText.setText(`Scenario ${idx + 1} of ${total}`);

        // Prompt box
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const promptBg = this.add
          .rectangle(width / 2, 80, width - 32, 72, 0x16213e)
          .setStrokeStyle(1, 0x445566);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const promptTxt = this.add
          .text(width / 2, 80, scenario.prompt, {
            fontSize: '13px',
            color: '#ccddff',
            wordWrap: { width: width - 52 },
            align: 'center',
          })
          .setOrigin(0.5);

        sceneObjects.push(promptBg, promptTxt);

        // Choices
        const choiceStartY = 148;
        const choiceH = 38;
        const choiceGap = 6;

        scenario.choices.forEach((choice, ci) => {
          const cy = choiceStartY + ci * (choiceH + choiceGap);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const choiceRect = this.add
            .rectangle(width / 2, cy, width - 48, choiceH, 0x223366)
            .setStrokeStyle(1, 0x556699)
            .setInteractive({ useHandCursor: true });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const choiceLbl = this.add
            .text(width / 2, cy, choice.text, {
              fontSize: '12px',
              color: '#aaccff',
              wordWrap: { width: width - 64 },
              align: 'center',
            })
            .setOrigin(0.5);

          sceneObjects.push(choiceRect, choiceLbl);

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          choiceRect.on('pointerup', () => {
            // Disable all choices immediately
            scenario.choices.forEach((_, k) => {
              const obj = sceneObjects[2 + k * 2];
              if (obj) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                obj.disableInteractive();
              }
            });

            const isCorrect = choice.isCorrect;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            choiceRect.setFillStyle(isCorrect ? 0x115533 : 0x551111);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            choiceRect.setStrokeStyle(2, isCorrect ? 0x22cc88 : 0xcc4444);

            if (showFeedback && choice.feedback) {
              const feedbackY = choiceStartY + scenario.choices.length * (choiceH + choiceGap) + 16;
              // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
              const fbTxt = this.add
                .text(width / 2, feedbackY, choice.feedback, {
                  fontSize: '12px',
                  color: isCorrect ? '#22cc88' : '#cc6666',
                  wordWrap: { width: width - 52 },
                  align: 'center',
                })
                .setOrigin(0.5);
              sceneObjects.push(fbTxt);
            }

            // Advance after short delay
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            this.time.delayedCall(showFeedback ? 1200 : 400, () => {
              scenarioIndex++;
              if (scenarioIndex < total) {
                showScenario(scenarioIndex);
              } else {
                clearScene();
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                progressText.setText('All scenarios complete!');
                done.emit();
              }
            });
          });

          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          choiceRect.on('pointerover', () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            if (choiceRect.input?.enabled) choiceRect.setFillStyle(0x2a3d66);
          });
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          choiceRect.on('pointerout', () => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
            if (choiceRect.input?.enabled) choiceRect.setFillStyle(0x223366);
          });
        });
      };

      showScenario(0);
    }
  };
}
