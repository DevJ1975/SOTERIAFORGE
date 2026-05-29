import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { GameRepository } from '@forge/data-access';
import type { CardGameConfig } from '@forge/games';
import type { Game } from '@forge/shared';
import { PhaserHostComponent } from '@forge/games';
import { RiveCharacterComponent } from '@forge/games';
import { PlayerProgressService, type PlayerContext } from './player-progress.service';

@Component({
  selector: 'forge-game-player',
  standalone: true,
  imports: [PhaserHostComponent, RiveCharacterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading()) {
      <div class="game-player__status">Loading game…</div>
    } @else if (error()) {
      <div class="game-player__error">{{ error() }}</div>
    } @else if (game()) {
      @if (game()!.engine === 'rive' && game()!.riveAssetRef) {
        <forge-rive-character [src]="game()!.riveAssetRef!" [stateMachine]="'MainStateMachine'" />
      } @else {
        <forge-phaser-host [config]="gameConfig(game()!)" (completed)="onCompleted()" />
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .game-player__status,
      .game-player__error {
        padding: 2rem;
        border: 2px dashed var(--forge-border, #ccc);
        border-radius: 0.5rem;
        text-align: center;
        color: var(--forge-text-muted, #666);
      }
      .game-player__error {
        color: var(--forge-error, #ef4444);
      }
    `,
  ],
})
export class GamePlayerComponent implements OnInit {
  readonly gameId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly moduleId = input.required<string>();
  readonly tenantId = input.required<string>();
  readonly uid = input.required<string>();

  private readonly gameRepo = inject(GameRepository);
  private readonly playerProgress = inject(PlayerProgressService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly game = signal<Game | null>(null);

  async ngOnInit(): Promise<void> {
    // Skip Firestore fetches in SSR — game requires browser canvas anyway.
    if (!isPlatformBrowser(this.platformId)) {
      this.loading.set(false);
      return;
    }
    try {
      const g = await this.gameRepo.getById(this.tenantId(), this.gameId());
      if (!g) {
        this.error.set('Game not found.');
        return;
      }
      this.game.set(g);
    } catch (err) {
      console.error('[GamePlayerComponent] Failed to load game', err);
      this.error.set('Failed to load game. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Cast Game.config (Record<string, unknown>) to CardGameConfig for PhaserHostComponent.
   * If the config is missing or malformed, fall back to a minimal placeholder.
   */
  protected gameConfig(g: Game): CardGameConfig {
    const raw = g.config as Record<string, unknown>;
    if (raw && typeof raw['kind'] === 'string') {
      return raw as unknown as CardGameConfig;
    }
    // Fallback: render a trivial flip_reveal with the game title so the host
    // never receives an invalid config.
    const fallback: CardGameConfig = {
      kind: 'flip_reveal',
      title: g.title,
      cards: [{ id: 'default', label: g.title, revealText: 'No config provided.' }],
    };
    return fallback;
  }

  protected onCompleted(): void {
    const ctx: PlayerContext = {
      tenantId: this.tenantId(),
      courseId: this.courseId(),
      module: {
        id: this.moduleId(),
        courseId: this.courseId(),
        tenantId: this.tenantId(),
        title: this.game()?.title ?? '',
        order: 0,
        contentType: 'game',
        xpReward: 0,
        badgeRefs: [],
        completion: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      uid: this.uid(),
    };
    void this.playerProgress.recordCompletion(ctx);
  }
}
