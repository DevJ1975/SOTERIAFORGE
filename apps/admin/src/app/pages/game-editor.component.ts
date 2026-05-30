import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { GameRepository } from '@assurance/data-access';
import { TenantService } from '@assurance/auth';
import type { Game } from '@assurance/shared';
import {
  validateCardGameConfig,
  type CardGameConfig,
  type CardAsset,
  type FlipRevealConfig,
  type MatchPairsConfig,
  type SortBucketsConfig,
  type ScenarioCardsConfig,
  type ScenarioCard,
  type BucketDef,
} from '@assurance/games/model';

type GameKind = CardGameConfig['kind'];

@Component({
  selector: 'assurance-admin-game-editor',
  standalone: true,
  imports: [RouterLink, FormsModule, ButtonModule, InputTextModule, SelectModule, CheckboxModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="game-editor">
      <nav class="game-editor__nav">
        <a routerLink="/games">← Back to Games</a>
      </nav>

      @if (loadError()) {
        <p class="game-editor__error">{{ loadError() }}</p>
      } @else if (loading()) {
        <p>Loading game…</p>
      } @else if (game()) {
        <h1>{{ game()!.title }}</h1>
        <p class="game-editor__meta">
          Engine: {{ game()!.engine }} &nbsp;|&nbsp; Kind: {{ configKind() }}
        </p>

        <!-- Rive asset ref -->
        <div class="game-editor__section">
          <h2>Rive Character (optional)</h2>
          <input
            pInputText
            type="text"
            placeholder="Rive asset ref (gs:// path)"
            [(ngModel)]="editRiveAssetRef"
            aria-label="Rive asset ref"
          />
        </div>

        <!-- flip_reveal editor -->
        @if (configKind() === 'flip_reveal') {
          <div class="game-editor__section">
            <h2>Flip &amp; Reveal Cards</h2>
            @for (card of flipCards(); track card.id; let ci = $index) {
              <div class="game-editor__card-row">
                <span class="game-editor__card-num">{{ ci + 1 }}</span>
                <input
                  pInputText
                  type="text"
                  placeholder="Front label"
                  [ngModel]="card.label"
                  (ngModelChange)="updateFlipCard(ci, 'label', $event)"
                  [attr.aria-label]="'Card ' + (ci + 1) + ' label'"
                />
                <input
                  pInputText
                  type="text"
                  placeholder="Reveal text"
                  [ngModel]="card.revealText"
                  (ngModelChange)="updateFlipCard(ci, 'revealText', $event)"
                  [attr.aria-label]="'Card ' + (ci + 1) + ' reveal text'"
                />
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  size="small"
                  [text]="true"
                  (onClick)="removeFlipCard(ci)"
                  aria-label="Remove card"
                />
              </div>
            }
            <p-button
              label="Add Card"
              severity="secondary"
              size="small"
              (onClick)="addFlipCard()"
            />
          </div>
        }

        <!-- match_pairs editor -->
        @if (configKind() === 'match_pairs') {
          <div class="game-editor__section">
            <h2>Match Pairs</h2>
            @for (pair of matchPairs(); track pair.id; let pi = $index) {
              <div class="game-editor__pair-row">
                <span class="game-editor__card-num">{{ pi + 1 }}</span>
                <input
                  pInputText
                  type="text"
                  placeholder="Question"
                  [ngModel]="pair.question.label"
                  (ngModelChange)="updatePair(pi, 'question', $event)"
                  [attr.aria-label]="'Pair ' + (pi + 1) + ' question'"
                />
                <input
                  pInputText
                  type="text"
                  placeholder="Answer"
                  [ngModel]="pair.answer.label"
                  (ngModelChange)="updatePair(pi, 'answer', $event)"
                  [attr.aria-label]="'Pair ' + (pi + 1) + ' answer'"
                />
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  size="small"
                  [text]="true"
                  (onClick)="removePair(pi)"
                  aria-label="Remove pair"
                />
              </div>
            }
            <p-button label="Add Pair" severity="secondary" size="small" (onClick)="addPair()" />
          </div>
        }

        <!-- sort_buckets editor -->
        @if (configKind() === 'sort_buckets') {
          <div class="game-editor__section">
            <h2>Sort Buckets — Cards</h2>
            @for (card of bucketCards(); track card.id; let ci = $index) {
              <div class="game-editor__card-row">
                <span class="game-editor__card-num">{{ ci + 1 }}</span>
                <input
                  pInputText
                  type="text"
                  placeholder="Card label"
                  [ngModel]="card.label"
                  (ngModelChange)="updateBucketCard(ci, $event)"
                  [attr.aria-label]="'Card ' + (ci + 1) + ' label'"
                />
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  size="small"
                  [text]="true"
                  (onClick)="removeBucketCard(ci)"
                  aria-label="Remove card"
                />
              </div>
            }
            <p-button
              label="Add Card"
              severity="secondary"
              size="small"
              (onClick)="addBucketCard()"
            />

            <h2>Buckets</h2>
            @for (bucket of buckets(); track bucket.id; let bi = $index) {
              <div class="game-editor__bucket-row">
                <span class="game-editor__card-num">{{ bi + 1 }}</span>
                <input
                  pInputText
                  type="text"
                  placeholder="Bucket label"
                  [ngModel]="bucket.label"
                  (ngModelChange)="updateBucketLabel(bi, $event)"
                  [attr.aria-label]="'Bucket ' + (bi + 1) + ' label'"
                />
                <p-button
                  icon="pi pi-trash"
                  severity="danger"
                  size="small"
                  [text]="true"
                  (onClick)="removeBucket(bi)"
                  aria-label="Remove bucket"
                />
              </div>
            }
            <p-button
              label="Add Bucket"
              severity="secondary"
              size="small"
              (onClick)="addBucket()"
            />
          </div>
        }

        <!-- scenario_cards editor -->
        @if (configKind() === 'scenario_cards') {
          <div class="game-editor__section">
            <h2>Scenario Cards</h2>
            @for (scenario of scenarios(); track scenario.id; let si = $index) {
              <div class="game-editor__scenario-card">
                <div class="game-editor__scenario-header">
                  <span class="game-editor__card-num">Scenario {{ si + 1 }}</span>
                  <p-button
                    icon="pi pi-trash"
                    severity="danger"
                    size="small"
                    [text]="true"
                    (onClick)="removeScenario(si)"
                    aria-label="Remove scenario"
                  />
                </div>
                <input
                  pInputText
                  type="text"
                  placeholder="Scenario prompt"
                  [ngModel]="scenario.prompt"
                  (ngModelChange)="updateScenarioPrompt(si, $event)"
                  [attr.aria-label]="'Scenario ' + (si + 1) + ' prompt'"
                />
                <div class="game-editor__choices">
                  <strong>Choices</strong>
                  @for (choice of scenario.choices; track choice.id; let ci = $index) {
                    <div class="game-editor__choice-row">
                      <input
                        pInputText
                        type="text"
                        [placeholder]="'Choice ' + (ci + 1)"
                        [ngModel]="choice.text"
                        (ngModelChange)="updateChoiceText(si, ci, $event)"
                        [attr.aria-label]="'Choice ' + (ci + 1) + ' text'"
                      />
                      <label class="game-editor__checkbox-label">
                        <p-checkbox
                          [ngModel]="choice.isCorrect"
                          (ngModelChange)="updateChoiceCorrect(si, ci, $event)"
                          [binary]="true"
                          [inputId]="'choice-correct-' + scenario.id + '-' + ci"
                        />
                        Correct
                      </label>
                      <p-button
                        icon="pi pi-times"
                        severity="danger"
                        size="small"
                        [text]="true"
                        (onClick)="removeChoice(si, ci)"
                        aria-label="Remove choice"
                      />
                    </div>
                  }
                  <p-button
                    label="Add Choice"
                    severity="secondary"
                    size="small"
                    (onClick)="addChoice(si)"
                  />
                </div>
              </div>
            }
            <p-button
              label="Add Scenario"
              severity="secondary"
              size="small"
              (onClick)="addScenario()"
            />
          </div>
        }

        <!-- Validation errors -->
        @if (validationErrors().length > 0) {
          <div class="game-editor__validation">
            <strong>Please fix the following before saving:</strong>
            <ul>
              @for (err of validationErrors(); track $index) {
                <li>{{ err }}</li>
              }
            </ul>
          </div>
        }

        <!-- Save -->
        <div class="game-editor__save-row">
          <p-button
            label="Save Game"
            [loading]="saving()"
            [disabled]="validationErrors().length > 0"
            (onClick)="saveGame()"
          />
          @if (saveError()) {
            <p class="game-editor__error">{{ saveError() }}</p>
          }
          @if (saveSuccess()) {
            <p class="game-editor__success">Game saved.</p>
          }
        </div>
      } @else {
        <p>Game not found.</p>
      }
    </section>
  `,
  styles: [
    `
      .game-editor {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .game-editor__nav {
        margin-bottom: 1rem;
      }
      .game-editor__nav a {
        color: inherit;
        text-decoration: underline;
      }
      .game-editor__meta {
        color: #6b7280;
        font-size: 0.875rem;
        margin-bottom: 1rem;
      }
      .game-editor__section {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .game-editor__card-row,
      .game-editor__pair-row,
      .game-editor__bucket-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.5rem;
      }
      .game-editor__card-num {
        font-weight: 700;
        min-width: 1.5rem;
      }
      .game-editor__scenario-card {
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
        padding: 0.75rem;
        margin-bottom: 0.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .game-editor__scenario-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .game-editor__choices {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-top: 0.5rem;
      }
      .game-editor__choice-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .game-editor__checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.875rem;
      }
      .game-editor__validation {
        background: #fef2f2;
        border: 1px solid #fca5a5;
        border-radius: 0.375rem;
        padding: 0.75rem 1rem;
        margin-bottom: 1rem;
        color: #991b1b;
      }
      .game-editor__validation ul {
        margin: 0.25rem 0 0 1rem;
        padding: 0;
      }
      .game-editor__save-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
        margin-top: 1rem;
      }
      .game-editor__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .game-editor__success {
        color: #166534;
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class GameEditorComponent {
  /** Route param injected via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly gameRepo = inject(GameRepository);
  private readonly tenantService = inject(TenantService);

  protected readonly game = signal<Game | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal(false);
  protected readonly validationErrors = signal<string[]>([]);

  // Editable sub-state
  protected readonly flipCards = signal<Array<CardAsset & { revealText: string }>>([]);
  protected readonly matchPairs = signal<
    Array<{ id: string; question: CardAsset; answer: CardAsset }>
  >([]);
  protected readonly bucketCards = signal<CardAsset[]>([]);
  protected readonly buckets = signal<BucketDef[]>([]);
  protected readonly scenarios = signal<ScenarioCard[]>([]);

  protected editRiveAssetRef = '';

  constructor() {
    effect(() => {
      const gid = this.id();
      if (gid) {
        void this.loadGame(gid);
      }
    });
  }

  protected configKind(): GameKind | null {
    const g = this.game();
    if (!g) return null;
    return (g.config as { kind?: GameKind })['kind'] ?? null;
  }

  private async loadGame(gameId: string): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const g = await this.gameRepo.getById(tid, gameId);
      this.game.set(g);
      if (g) {
        this.editRiveAssetRef = g.riveAssetRef ?? '';
        this.initEditorState(g.config as unknown as CardGameConfig);
        this.runValidation(g.config as unknown as CardGameConfig);
      }
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load game');
    } finally {
      this.loading.set(false);
    }
  }

  private initEditorState(config: CardGameConfig): void {
    switch (config.kind) {
      case 'flip_reveal':
        this.flipCards.set([...config.cards]);
        break;
      case 'match_pairs':
        this.matchPairs.set(config.pairs.map((p) => ({ ...p })));
        break;
      case 'sort_buckets':
        this.bucketCards.set([...config.cards]);
        this.buckets.set(config.buckets.map((b) => ({ ...b })));
        break;
      case 'scenario_cards':
        this.scenarios.set(
          config.scenarios.map((s) => ({ ...s, choices: s.choices.map((c) => ({ ...c })) })),
        );
        break;
    }
  }

  private buildConfig(): CardGameConfig | null {
    const g = this.game();
    if (!g) return null;
    const base = g.config as unknown as CardGameConfig;
    switch (base.kind) {
      case 'flip_reveal': {
        const cfg: FlipRevealConfig = { ...base, cards: this.flipCards() };
        return cfg;
      }
      case 'match_pairs': {
        const cfg: MatchPairsConfig = { ...base, pairs: this.matchPairs() };
        return cfg;
      }
      case 'sort_buckets': {
        const cfg: SortBucketsConfig = {
          ...base,
          cards: this.bucketCards(),
          buckets: this.buckets(),
        };
        return cfg;
      }
      case 'scenario_cards': {
        const cfg: ScenarioCardsConfig = { ...base, scenarios: this.scenarios() };
        return cfg;
      }
    }
  }

  private runValidation(config: CardGameConfig): void {
    this.validationErrors.set(validateCardGameConfig(config));
  }

  private refreshValidation(): void {
    const cfg = this.buildConfig();
    if (cfg) this.runValidation(cfg);
  }

  // --- flip_reveal mutations ---

  protected addFlipCard(): void {
    this.flipCards.update((cards) => [
      ...cards,
      { id: crypto.randomUUID(), label: '', revealText: '' },
    ]);
    this.refreshValidation();
  }

  protected removeFlipCard(index: number): void {
    this.flipCards.update((cards) => cards.filter((_, i) => i !== index));
    this.refreshValidation();
  }

  protected updateFlipCard(index: number, field: 'label' | 'revealText', value: string): void {
    this.flipCards.update((cards) =>
      cards.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    );
    this.refreshValidation();
  }

  // --- match_pairs mutations ---

  protected addPair(): void {
    this.matchPairs.update((pairs) => [
      ...pairs,
      {
        id: crypto.randomUUID(),
        question: { id: crypto.randomUUID(), label: '' },
        answer: { id: crypto.randomUUID(), label: '' },
      },
    ]);
    this.refreshValidation();
  }

  protected removePair(index: number): void {
    this.matchPairs.update((pairs) => pairs.filter((_, i) => i !== index));
    this.refreshValidation();
  }

  protected updatePair(index: number, side: 'question' | 'answer', value: string): void {
    this.matchPairs.update((pairs) =>
      pairs.map((p, i) => (i === index ? { ...p, [side]: { ...p[side], label: value } } : p)),
    );
    this.refreshValidation();
  }

  // --- sort_buckets card mutations ---

  protected addBucketCard(): void {
    this.bucketCards.update((cards) => [...cards, { id: crypto.randomUUID(), label: '' }]);
    this.refreshValidation();
  }

  protected removeBucketCard(index: number): void {
    const removedId = this.bucketCards()[index]?.id;
    this.bucketCards.update((cards) => cards.filter((_, i) => i !== index));
    if (removedId) {
      this.buckets.update((buckets) =>
        buckets.map((b) => ({
          ...b,
          correctCardIds: b.correctCardIds.filter((id) => id !== removedId),
        })),
      );
    }
    this.refreshValidation();
  }

  protected updateBucketCard(index: number, value: string): void {
    this.bucketCards.update((cards) =>
      cards.map((c, i) => (i === index ? { ...c, label: value } : c)),
    );
    this.refreshValidation();
  }

  // --- sort_buckets bucket mutations ---

  protected addBucket(): void {
    this.buckets.update((buckets) => [
      ...buckets,
      { id: crypto.randomUUID(), label: '', correctCardIds: [] },
    ]);
    this.refreshValidation();
  }

  protected removeBucket(index: number): void {
    this.buckets.update((buckets) => buckets.filter((_, i) => i !== index));
    this.refreshValidation();
  }

  protected updateBucketLabel(index: number, value: string): void {
    this.buckets.update((buckets) =>
      buckets.map((b, i) => (i === index ? { ...b, label: value } : b)),
    );
    this.refreshValidation();
  }

  // --- scenario_cards mutations ---

  protected addScenario(): void {
    this.scenarios.update((scenarios) => [
      ...scenarios,
      {
        id: crypto.randomUUID(),
        prompt: '',
        choices: [
          { id: crypto.randomUUID(), text: '', isCorrect: true },
          { id: crypto.randomUUID(), text: '', isCorrect: false },
        ],
      },
    ]);
    this.refreshValidation();
  }

  protected removeScenario(index: number): void {
    this.scenarios.update((scenarios) => scenarios.filter((_, i) => i !== index));
    this.refreshValidation();
  }

  protected updateScenarioPrompt(index: number, value: string): void {
    this.scenarios.update((scenarios) =>
      scenarios.map((s, i) => (i === index ? { ...s, prompt: value } : s)),
    );
    this.refreshValidation();
  }

  protected addChoice(scenarioIndex: number): void {
    this.scenarios.update((scenarios) =>
      scenarios.map((s, i) =>
        i === scenarioIndex
          ? {
              ...s,
              choices: [...s.choices, { id: crypto.randomUUID(), text: '', isCorrect: false }],
            }
          : s,
      ),
    );
    this.refreshValidation();
  }

  protected removeChoice(scenarioIndex: number, choiceIndex: number): void {
    this.scenarios.update((scenarios) =>
      scenarios.map((s, i) =>
        i === scenarioIndex
          ? { ...s, choices: s.choices.filter((_, ci) => ci !== choiceIndex) }
          : s,
      ),
    );
    this.refreshValidation();
  }

  protected updateChoiceText(scenarioIndex: number, choiceIndex: number, value: string): void {
    this.scenarios.update((scenarios) =>
      scenarios.map((s, i) =>
        i === scenarioIndex
          ? {
              ...s,
              choices: s.choices.map((c, ci) => (ci === choiceIndex ? { ...c, text: value } : c)),
            }
          : s,
      ),
    );
    this.refreshValidation();
  }

  protected updateChoiceCorrect(scenarioIndex: number, choiceIndex: number, value: boolean): void {
    this.scenarios.update((scenarios) =>
      scenarios.map((s, i) =>
        i === scenarioIndex
          ? {
              ...s,
              choices: s.choices.map((c, ci) =>
                ci === choiceIndex ? { ...c, isCorrect: value } : c,
              ),
            }
          : s,
      ),
    );
    this.refreshValidation();
  }

  protected async saveGame(): Promise<void> {
    const tid = this.tenantService.tenantId();
    const current = this.game();
    if (!tid || !current) return;

    const config = this.buildConfig();
    if (!config) return;

    const errors = validateCardGameConfig(config);
    this.validationErrors.set(errors);
    if (errors.length > 0) return;

    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    try {
      const updated: Game = {
        ...current,
        config: config as unknown as Record<string, unknown>,
        riveAssetRef: this.editRiveAssetRef.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      await this.gameRepo.set(tid, updated);
      this.game.set(updated);
      this.saveSuccess.set(true);
    } catch (err) {
      this.saveError.set((err as Error).message ?? 'Failed to save game');
    } finally {
      this.saving.set(false);
    }
  }
}
