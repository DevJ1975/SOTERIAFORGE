import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type CardGameConfig,
  type FlipRevealConfig,
  type GameResult,
  type MatchPairsConfig,
  type ScenarioCardsConfig,
  type SortBucketsConfig,
  validateCardGameConfig,
} from './card-game.model';

interface MatchCell {
  /** `${pairId}:q` or `${pairId}:a` — stable, unique. */
  id: string;
  pairId: string;
  label: string;
}

/**
 * Keyboard- and screen-reader-accessible renderer for the four card-game kinds,
 * built from native semantic HTML (buttons, selects, radio fieldsets) instead of
 * a canvas. This is the default game renderer (see `GamePlayerComponent`); the
 * Phaser canvas host is retained in the library but no longer wired in.
 *
 * Graded kinds (match_pairs, sort_buckets, scenario_cards) compute a 0–100 score
 * reported via the `completed` output; flip_reveal is completion-only. The server
 * remains authoritative for XP/badges — the score is advisory input to the LMS.
 */
@Component({
  selector: 'assurance-accessible-card-game',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (configError()) {
      <p class="acg__error" role="alert">{{ configError() }}</p>
    } @else {
      <section class="acg" [attr.aria-label]="config().title">
        <h2 class="acg__title">{{ config().title }}</h2>

        <!-- Polite live region: progress + feedback announcements. -->
        <p class="acg__status" role="status" aria-live="polite">{{ announce() }}</p>

        @switch (config().kind) {
          @case ('flip_reveal') {
            <ul class="acg__grid" role="list">
              @for (card of flip().cards; track card.id) {
                <li>
                  <button
                    type="button"
                    class="acg__card"
                    [class.acg__card--revealed]="isRevealed(card.id)"
                    [attr.aria-expanded]="isRevealed(card.id)"
                    (click)="reveal(card.id)"
                  >
                    <span class="acg__card-face">{{ card.label }}</span>
                    @if (isRevealed(card.id)) {
                      <span class="acg__card-reveal">{{ card.revealText }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }

          @case ('match_pairs') {
            <ul class="acg__grid" role="list">
              @for (cell of matchCells(); track cell.id) {
                <li>
                  <button
                    type="button"
                    class="acg__card"
                    [class.acg__card--matched]="isMatched(cell)"
                    [class.acg__card--selected]="isSelected(cell)"
                    [attr.aria-pressed]="isSelected(cell)"
                    [attr.aria-label]="isMatched(cell) ? cell.label + ' (matched)' : cell.label"
                    [disabled]="isMatched(cell) || done()"
                    (click)="pick(cell)"
                  >
                    {{ cell.label }}
                  </button>
                </li>
              }
            </ul>
          }

          @case ('sort_buckets') {
            <ul class="acg__rows" role="list">
              @for (card of sort().cards; track card.id) {
                <li class="acg__row">
                  <label [attr.for]="'acg-sort-' + card.id">{{ card.label }}</label>
                  <select
                    [id]="'acg-sort-' + card.id"
                    [ngModel]="placement()[card.id] ?? ''"
                    [ngModelOptions]="{ standalone: true }"
                    [disabled]="done()"
                    (ngModelChange)="setBucket(card.id, $event)"
                  >
                    <option value="">— choose —</option>
                    @for (bucket of sort().buckets; track bucket.id) {
                      <option [value]="bucket.id">{{ bucket.label }}</option>
                    }
                  </select>
                </li>
              }
            </ul>
            @if (!done()) {
              <button
                type="button"
                class="acg__action"
                [disabled]="!allPlaced()"
                (click)="checkSort()"
              >
                Check answers
              </button>
            }
          }

          @case ('scenario_cards') {
            @for (scenario of scenario().scenarios; track scenario.id) {
              <fieldset class="acg__scenario">
                <legend>{{ scenario.prompt }}</legend>
                @for (choice of scenario.choices; track choice.id) {
                  <label class="acg__choice">
                    <input
                      type="radio"
                      [name]="'acg-scenario-' + scenario.id"
                      [value]="choice.id"
                      [checked]="answers()[scenario.id] === choice.id"
                      [disabled]="done()"
                      (change)="setAnswer(scenario, choice)"
                    />
                    {{ choice.text }}
                  </label>
                }
                @if (feedback()[scenario.id]; as fb) {
                  <p class="acg__feedback">{{ fb }}</p>
                }
              </fieldset>
            }
            @if (!done()) {
              <button
                type="button"
                class="acg__action"
                [disabled]="!allAnswered()"
                (click)="finishScenarios()"
              >
                Finish
              </button>
            }
          }
        }

        @if (done()) {
          <p class="acg__done" role="status">{{ doneMessage() }}</p>
        }
      </section>
    }
  `,
  styles: [
    `
      .acg__title {
        margin: 0 0 0.5rem;
        font-size: 1.25rem;
      }
      .acg__status {
        min-height: 1.25rem;
        font-size: 0.875rem;
        color: var(--assurance-color-text-muted, #6b7280);
      }
      .acg__grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
        gap: 0.75rem;
      }
      .acg__card {
        width: 100%;
        min-height: 5rem;
        padding: 0.75rem;
        border: 1px solid var(--assurance-border, #d1d5db);
        border-radius: var(--assurance-radius, 0.5rem);
        background: #fff;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        text-align: left;
        font: inherit;
      }
      .acg__card--selected {
        outline: 3px solid var(--assurance-primary, #0b5fff);
      }
      .acg__card--matched {
        background: #ecfdf5;
        border-color: #10b981;
      }
      .acg__card-reveal {
        font-size: 0.8125rem;
        color: var(--assurance-color-text-muted, #6b7280);
      }
      .acg__rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .acg__row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      .acg__row select {
        min-width: 10rem;
        min-height: 2.5rem;
      }
      .acg__scenario {
        border: 1px solid var(--assurance-border, #d1d5db);
        border-radius: var(--assurance-radius, 0.5rem);
        margin: 0 0 1rem;
        padding: 0.75rem 1rem;
      }
      .acg__choice {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.25rem 0;
      }
      .acg__feedback {
        margin: 0.5rem 0 0;
        font-size: 0.875rem;
      }
      .acg__action {
        margin-top: 1rem;
        min-height: 2.75rem;
        padding: 0 1.25rem;
        border: 0;
        border-radius: var(--assurance-radius, 0.5rem);
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
        font: inherit;
        cursor: pointer;
      }
      .acg__action:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .acg__done {
        margin-top: 1rem;
        font-weight: 600;
      }
      .acg__error {
        color: #b00020;
      }
    `,
  ],
})
export class AccessibleCardGameComponent implements OnInit {
  readonly config = input.required<CardGameConfig>();
  readonly completed = output<GameResult>();

  protected readonly configError = signal<string | null>(null);
  protected readonly announce = signal('');
  protected readonly done = signal(false);
  protected readonly doneMessage = signal('');

  // flip_reveal
  protected readonly revealed = signal<ReadonlySet<string>>(new Set());
  // match_pairs
  protected readonly matchCells = signal<MatchCell[]>([]);
  private readonly matched = signal<ReadonlySet<string>>(new Set());
  private readonly firstPickId = signal<string | null>(null);
  private readonly attempts = signal(0);
  // sort_buckets
  protected readonly placement = signal<Record<string, string>>({});
  // scenario_cards
  protected readonly answers = signal<Record<string, string>>({});
  protected readonly feedback = signal<Record<string, string>>({});

  // Narrowing helpers for the template (only read inside the matching @case).
  protected readonly flip = computed(() => this.config() as FlipRevealConfig);
  protected readonly match = computed(() => this.config() as MatchPairsConfig);
  protected readonly sort = computed(() => this.config() as SortBucketsConfig);
  protected readonly scenario = computed(() => this.config() as ScenarioCardsConfig);

  protected readonly allPlaced = computed(() => {
    const p = this.placement();
    return this.sort().cards.every((c) => !!p[c.id]);
  });
  protected readonly allAnswered = computed(() => {
    const a = this.answers();
    return this.scenario().scenarios.every((s) => !!a[s.id]);
  });

  ngOnInit(): void {
    const cfg = this.config();
    const errors = validateCardGameConfig(cfg);
    if (errors.length > 0) {
      this.configError.set(errors[0]);
      return;
    }
    if (cfg.kind === 'match_pairs') {
      this.matchCells.set(this.buildMatchCells(cfg));
    } else if (cfg.kind === 'sort_buckets') {
      this.placement.set(Object.fromEntries(cfg.cards.map((c) => [c.id, ''])));
    } else if (cfg.kind === 'scenario_cards') {
      this.answers.set(Object.fromEntries(cfg.scenarios.map((s) => [s.id, ''])));
    }
  }

  // ---- flip_reveal --------------------------------------------------------
  protected isRevealed(id: string): boolean {
    return this.revealed().has(id);
  }
  protected reveal(id: string): void {
    if (this.revealed().has(id)) return;
    const next = new Set(this.revealed());
    next.add(id);
    this.revealed.set(next);
    const total = this.flip().cards.length;
    this.announce.set(`Revealed ${next.size} of ${total}.`);
    if (next.size === total) {
      this.finish(
        { kind: 'flip_reveal', totalItems: total, correctCount: total },
        'All cards revealed.',
      );
    }
  }

  // ---- match_pairs --------------------------------------------------------
  private buildMatchCells(cfg: MatchPairsConfig): MatchCell[] {
    const cells: MatchCell[] = [];
    for (const p of cfg.pairs) {
      cells.push({ id: `${p.id}:q`, pairId: p.id, label: p.question.label });
      cells.push({ id: `${p.id}:a`, pairId: p.id, label: p.answer.label });
    }
    if (cfg.shuffle !== false) {
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
      }
    }
    return cells;
  }
  protected isMatched(cell: MatchCell): boolean {
    return this.matched().has(cell.pairId);
  }
  protected isSelected(cell: MatchCell): boolean {
    return this.firstPickId() === cell.id;
  }
  protected pick(cell: MatchCell): void {
    if (this.done() || this.isMatched(cell)) return;
    const first = this.firstPickId();
    if (first === cell.id) {
      this.firstPickId.set(null);
      return;
    }
    if (!first) {
      this.firstPickId.set(cell.id);
      this.announce.set(`Selected ${cell.label}. Choose its match.`);
      return;
    }
    const firstCell = this.matchCells().find((c) => c.id === first);
    this.firstPickId.set(null);
    if (!firstCell) return;
    this.attempts.update((a) => a + 1);
    if (firstCell.pairId === cell.pairId) {
      const next = new Set(this.matched());
      next.add(cell.pairId);
      this.matched.set(next);
      this.announce.set(`Matched ${firstCell.label} with ${cell.label}.`);
      const totalPairs = this.match().pairs.length;
      if (next.size === totalPairs) {
        const score = Math.min(100, Math.round((totalPairs / this.attempts()) * 100));
        this.finish(
          { kind: 'match_pairs', totalItems: totalPairs, correctCount: totalPairs, score },
          `All pairs matched — ${score}%.`,
        );
      }
    } else {
      this.announce.set(`${firstCell.label} and ${cell.label} do not match. Try again.`);
    }
  }

  // ---- sort_buckets -------------------------------------------------------
  protected setBucket(cardId: string, bucketId: string): void {
    this.placement.set({ ...this.placement(), [cardId]: bucketId });
  }
  protected checkSort(): void {
    const cfg = this.sort();
    const placement = this.placement();
    let correct = 0;
    for (const card of cfg.cards) {
      const bucket = cfg.buckets.find((b) => b.id === placement[card.id]);
      if (bucket?.correctCardIds.includes(card.id)) correct++;
    }
    const total = cfg.cards.length;
    const score = Math.round((correct / total) * 100);
    this.finish(
      { kind: 'sort_buckets', totalItems: total, correctCount: correct, score },
      `You placed ${correct} of ${total} correctly — ${score}%.`,
    );
  }

  // ---- scenario_cards -----------------------------------------------------
  protected setAnswer(
    scenario: ScenarioCardsConfig['scenarios'][number],
    choice: ScenarioCardsConfig['scenarios'][number]['choices'][number],
  ): void {
    this.answers.set({ ...this.answers(), [scenario.id]: choice.id });
    if (this.scenario().showImmediateFeedback !== false) {
      const msg = choice.feedback ?? (choice.isCorrect ? 'Correct.' : 'Not the best choice.');
      this.feedback.set({ ...this.feedback(), [scenario.id]: msg });
      this.announce.set(msg);
    }
  }
  protected finishScenarios(): void {
    const cfg = this.scenario();
    const answers = this.answers();
    let correct = 0;
    for (const s of cfg.scenarios) {
      const choice = s.choices.find((c) => c.id === answers[s.id]);
      if (choice?.isCorrect) correct++;
    }
    const total = cfg.scenarios.length;
    const score = Math.round((correct / total) * 100);
    this.finish(
      { kind: 'scenario_cards', totalItems: total, correctCount: correct, score },
      `You answered ${correct} of ${total} correctly — ${score}%.`,
    );
  }

  // ---- shared -------------------------------------------------------------
  private finish(result: GameResult, message: string): void {
    if (this.done()) return;
    this.done.set(true);
    this.doneMessage.set(message);
    this.announce.set(message);
    this.completed.emit(result);
  }
}
