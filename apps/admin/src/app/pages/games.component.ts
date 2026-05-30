import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { GameRepository } from '@assurance/data-access';
import { TenantService } from '@assurance/auth';
import type { Game } from '@assurance/shared';
import type { CardGameConfig } from '@assurance/games/model';

/** Minimal valid configs for each CardGameConfig kind. */
function makeDefaultConfig(kind: CardGameConfig['kind'], title: string): CardGameConfig {
  switch (kind) {
    case 'flip_reveal':
      return {
        kind: 'flip_reveal',
        title,
        cards: [
          {
            id: crypto.randomUUID(),
            label: 'Card 1',
            revealText: 'Reveal text',
          },
        ],
      };
    case 'match_pairs':
      return {
        kind: 'match_pairs',
        title,
        pairs: [
          {
            id: crypto.randomUUID(),
            question: { id: crypto.randomUUID(), label: 'Question A' },
            answer: { id: crypto.randomUUID(), label: 'Answer A' },
          },
          {
            id: crypto.randomUUID(),
            question: { id: crypto.randomUUID(), label: 'Question B' },
            answer: { id: crypto.randomUUID(), label: 'Answer B' },
          },
        ],
      };
    case 'sort_buckets':
      return {
        kind: 'sort_buckets',
        title,
        cards: [{ id: crypto.randomUUID(), label: 'Card 1' }],
        buckets: [
          { id: crypto.randomUUID(), label: 'Bucket A', correctCardIds: [] },
          { id: crypto.randomUUID(), label: 'Bucket B', correctCardIds: [] },
        ],
      };
    case 'scenario_cards':
      return {
        kind: 'scenario_cards',
        title,
        scenarios: [
          {
            id: crypto.randomUUID(),
            prompt: 'Scenario prompt',
            choices: [
              { id: crypto.randomUUID(), text: 'Choice A', isCorrect: true },
              { id: crypto.randomUUID(), text: 'Choice B', isCorrect: false },
            ],
          },
        ],
      };
  }
}

type GameKind = CardGameConfig['kind'];

const GAME_KIND_OPTIONS: { label: string; value: GameKind }[] = [
  { label: 'Flip & Reveal', value: 'flip_reveal' },
  { label: 'Match Pairs', value: 'match_pairs' },
  { label: 'Sort Buckets', value: 'sort_buckets' },
  { label: 'Scenario Cards', value: 'scenario_cards' },
];

@Component({
  selector: 'assurance-admin-games',
  standalone: true,
  imports: [RouterLink, FormsModule, ButtonModule, InputTextModule, TableModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="games">
      <h1>Games</h1>

      <!-- New Game Form -->
      <div class="games__new-form">
        <h2>New Game</h2>
        <div class="games__form-row">
          <input
            pInputText
            type="text"
            placeholder="Game title"
            [(ngModel)]="newTitle"
            aria-label="Game title"
          />
          <p-select
            [options]="gameKindOptions"
            [(ngModel)]="newKind"
            placeholder="Template type"
            aria-label="Template type"
          />
          <p-button
            label="Create Game"
            [loading]="creating()"
            [disabled]="!newTitle.trim() || !newKind"
            (onClick)="createGame()"
          />
        </div>
        @if (createError()) {
          <p class="games__error">{{ createError() }}</p>
        }
      </div>

      <!-- Games Table -->
      @if (loading()) {
        <p>Loading games…</p>
      } @else if (loadError()) {
        <p class="games__error">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="games()"
          [paginator]="games().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th>
              <th>Engine</th>
              <th>Kind</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-g>
            <tr>
              <td>
                <a [routerLink]="['/games', g.id]">{{ g.title }}</a>
              </td>
              <td>{{ g.engine }}</td>
              <td>{{ g.config['kind'] ?? '—' }}</td>
              <td class="games__actions">
                <p-button
                  label="Edit"
                  severity="secondary"
                  size="small"
                  [routerLink]="['/games', g.id]"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4">No games found. Create your first game above.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .games {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .games__new-form {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .games__form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .games__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .games__actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class GamesComponent implements OnInit {
  private readonly gameRepo = inject(GameRepository);
  private readonly tenantService = inject(TenantService);

  protected readonly games = signal<Game[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly gameKindOptions = GAME_KIND_OPTIONS;

  protected newTitle = '';
  protected newKind: GameKind | null = null;

  ngOnInit(): void {
    void this.loadGames();
  }

  private async loadGames(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.gameRepo.list(tid);
      this.games.set(list);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load games');
    } finally {
      this.loading.set(false);
    }
  }

  protected async createGame(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid || !this.newTitle.trim() || !this.newKind) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const now = new Date().toISOString();
      const config = makeDefaultConfig(this.newKind, this.newTitle.trim());
      const newGame: Game = {
        id: crypto.randomUUID(),
        tenantId: tid,
        title: this.newTitle.trim(),
        engine: 'phaser',
        config: config as unknown as Record<string, unknown>,
        assetRefs: [],
        createdAt: now,
      };
      await this.gameRepo.set(tid, newGame);
      this.newTitle = '';
      this.newKind = null;
      await this.loadGames();
    } catch (err) {
      this.createError.set((err as Error).message ?? 'Failed to create game');
    } finally {
      this.creating.set(false);
    }
  }
}
