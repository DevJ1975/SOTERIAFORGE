import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  LearningApi,
  apiErrorMessage,
  type ApiAnswer,
  type ApiAttemptResult,
  type ApiCheckResult,
  type ApiCompletion,
  type ApiLessonQuiz,
  type ApiQuestion,
} from '@assurance/lms-core';

const SUPPORTED: readonly ApiQuestion['type'][] = [
  'mcq',
  'true_false',
  'multi_select',
  'fill_in',
  'ordering',
  'matching',
];

/**
 * Knowledge check for a lesson quiz. `check` mode takes one question at a time with
 * server feedback and unlimited retries; `graded` mode submits every answer once.
 * The server decides correctness and scores; this component never grades.
 */
@Component({
  selector: 'assurance-knowledge-check',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kc" [attr.aria-labelledby]="'kc-title-' + lessonId()">
      <h2 class="sf-h3" [id]="'kc-title-' + lessonId()">{{ quiz().title || 'Knowledge check' }}</h2>

      @if (quiz().questions.length === 0) {
        <p class="sf-sub">This quiz has no questions yet.</p>
      } @else if (quiz().mode === 'graded') {
        <div class="kc__live" role="status" aria-live="polite">
          @if (attempt(); as result) {
            <div class="kc__result">
              <p class="sf-h3 kc__after" tabindex="-1">
                {{ result.passed ? 'Passed' : 'Not passed' }} · {{ result.scorePct }}%
              </p>
              <p class="sf-sub">
                {{ result.earnedPoints }} of {{ result.totalPoints }} points. Attempts used:
                {{ result.attemptsUsed }}
                @if (result.attemptsRemaining !== null) {
                  · remaining: {{ result.attemptsRemaining }}
                }
              </p>
            </div>
          }
        </div>
        @if (attempt()) {
          <ol class="kc__list">
            @for (q of quiz().questions; track q.id) {
              <li>
                <span class="kc__qprompt">{{ q.prompt }}</span>
                <span class="sf-tag" [class.sf-tag--success]="perQuestion()[q.id]?.correct">{{
                  perQuestion()[q.id]?.correct ? 'Correct' : 'Incorrect'
                }}</span>
              </li>
            }
          </ol>
        } @else {
          <ol class="kc__list">
            @for (q of quiz().questions; track q.id) {
              <li>
                <ng-container
                  *ngTemplateOutlet="questionTpl; context: { $implicit: q, index: $index }"
                />
              </li>
            }
          </ol>
        }
        @if (error()) {
          <p class="kc__error" role="alert">{{ error() }}</p>
        }
        @if (!attempt() && hasUnsupported()) {
          <p class="kc__note" role="note">
            This quiz has a question type this app cannot answer yet, so it cannot be completed
            here. Your attempts are not used.
            @if (courseId()) {
              <a [routerLink]="['/courses', courseId()]">Back to course</a>
            }
          </p>
        }
        @if (!attempt() || (attempt()!.attemptsRemaining !== 0 && !attempt()!.passed)) {
          <div class="kc__actions">
            <button
              type="button"
              class="sf-btn sf-btn--primary"
              [disabled]="busy() || (!attempt() && (!allAnswered() || hasUnsupported()))"
              [attr.aria-busy]="busy()"
              (click)="attempt() ? retry() : submit()"
            >
              {{ busy() ? 'Submitting…' : attempt() ? 'Try again' : 'Submit quiz' }}
            </button>
            @if (!attempt() && !hasUnsupported() && !allAnswered()) {
              <span class="sf-sub">Answer every question to submit.</span>
            }
          </div>
        }
      } @else {
        @if (current(); as q) {
          <p class="sf-sub" aria-live="polite">
            Question {{ position() }} of {{ quiz().questions.length }}
          </p>
          <ng-container *ngTemplateOutlet="questionTpl; context: { $implicit: q, index: 0 }" />
          @if (error()) {
            <p class="kc__error" role="alert">{{ error() }}</p>
          }
          <div class="kc__live" aria-live="polite" role="status">
            @if (result(); as r) {
              <div class="sf-feedback" [class.kc__feedback--wrong]="!r.correct">
                <strong>{{ headline(r) }}</strong>
                @if (r.feedback) {
                  <span> {{ r.feedback }}</span>
                }
              </div>
            }
          </div>
          <div class="kc__actions">
            @if (result()?.solved) {
              @if (hasNext()) {
                <button type="button" class="sf-btn sf-btn--primary kc__after" (click)="next()">
                  Next question
                </button>
              } @else {
                <span class="kc__done kc__after" tabindex="-1"
                  >All questions answered correctly.</span
                >
              }
            } @else if (!isSupported(q)) {
              <span class="sf-sub">
                This question cannot be answered in this app, so the lesson cannot be completed
                here.
              </span>
              @if (courseId()) {
                <a
                  class="sf-btn sf-btn--secondary kc__link"
                  [routerLink]="['/courses', courseId()]"
                >
                  Back to course
                </a>
              }
            } @else {
              <button
                type="button"
                class="sf-btn sf-btn--primary"
                [disabled]="busy() || !canCheck(q)"
                [attr.aria-busy]="busy()"
                (click)="check(q)"
              >
                {{ busy() ? 'Checking…' : result() ? 'Try again' : 'Check answer' }}
              </button>
            }
          </div>
        } @else {
          <p class="kc__done" role="status">All questions answered correctly.</p>
        }
      }
    </section>

    <ng-template #questionTpl let-q let-index="index">
      <fieldset class="kc__q" [disabled]="locked()">
        <legend class="kc__qprompt" tabindex="-1">{{ q.prompt }}</legend>
        @if (!isSupported(q)) {
          <p class="kc__note" role="note">
            This question type ({{ q.type }}) is not supported yet in this app. Ask your instructor
            or use the web console to complete it.
          </p>
        } @else if (q.type === 'fill_in') {
          <label class="kc__label" [for]="'kc-text-' + q.id">Your answer</label>
          <input
            class="kc__input"
            type="text"
            autocomplete="off"
            [id]="'kc-text-' + q.id"
            [value]="texts()[q.id] ?? ''"
            (input)="setText(q.id, $any($event.target).value)"
          />
        } @else if (q.type === 'ordering') {
          <p class="sf-sub kc__hint" [id]="'kc-hint-' + q.id">
            Use Move up and Move down to put the items in the right order.
          </p>
          <ol class="kc__order" [attr.aria-describedby]="'kc-hint-' + q.id">
            @for (id of orderOf(q); track id; let k = $index, last = $last) {
              <li
                class="kc__order-item"
                [class.is-correct]="markCorrect(q.id)"
                [class.is-wrong]="markWrong(q.id)"
              >
                <span class="sf-option__key" aria-hidden="true">{{ k + 1 }}</span>
                <span class="kc__order-text" [id]="'kc-item-' + q.id + '-' + id">{{
                  optionText(q, id)
                }}</span>
                <span class="kc__order-moves">
                  <button
                    type="button"
                    class="sf-btn sf-btn--ghost sf-btn--sm"
                    [disabled]="k === 0"
                    [attr.aria-describedby]="'kc-item-' + q.id + '-' + id"
                    (click)="move(q, k, -1)"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    class="sf-btn sf-btn--ghost sf-btn--sm"
                    [disabled]="last"
                    [attr.aria-describedby]="'kc-item-' + q.id + '-' + id"
                    (click)="move(q, k, 1)"
                  >
                    Move down
                  </button>
                </span>
              </li>
            }
          </ol>
          <p class="kc__sr" aria-live="polite">{{ moved()[q.id] ?? '' }}</p>
        } @else if (q.type === 'matching') {
          <div class="kc__match">
            @for (left of q.matching?.left ?? []; track left; let k = $index) {
              <div
                class="kc__match-row"
                [class.is-correct]="markCorrect(q.id)"
                [class.is-wrong]="markWrong(q.id)"
              >
                <label class="kc__match-left" [for]="'kc-match-' + q.id + '-' + k">{{
                  left
                }}</label>
                <select
                  class="kc__input kc__select"
                  [id]="'kc-match-' + q.id + '-' + k"
                  [value]="matches()[q.id]?.[left] ?? ''"
                  (change)="setMatch(q.id, left, $any($event.target).value)"
                >
                  <option value="" [selected]="!matches()[q.id]?.[left]">Choose a match…</option>
                  @for (right of q.matching?.right ?? []; track right) {
                    <option [value]="right" [selected]="matches()[q.id]?.[left] === right">
                      {{ right }}
                    </option>
                  }
                </select>
              </div>
            }
          </div>
        } @else {
          <div class="kc__options" [attr.role]="q.type === 'multi_select' ? 'group' : 'radiogroup'">
            @for (o of q.options; track o.id; let k = $index) {
              <button
                type="button"
                class="sf-option"
                [attr.role]="q.type === 'multi_select' ? 'checkbox' : 'radio'"
                [attr.aria-checked]="isSelected(q.id, o.id)"
                [attr.tabindex]="tabStop(q, o.id, k)"
                (keydown)="onOptionKey($event, q, k)"
                [class.is-correct]="markCorrect(q.id)"
                [class.is-wrong]="markWrong(q.id)"
                (click)="toggle(q, o.id)"
              >
                <span class="sf-option__key" aria-hidden="true">{{ letter(k) }}</span>
                <span>{{ o.text }}</span>
                @if (isSelected(q.id, o.id)) {
                  <span class="kc__sr">(selected)</span>
                }
              </button>
            }
          </div>
        }
      </fieldset>
    </ng-template>
  `,
  styles: [
    `
      .kc {
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-4);
      }
      .kc__list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-5);
      }
      .kc__q {
        border: 0;
        margin: 0;
        padding: 0;
        min-inline-size: 0;
      }
      .kc__qprompt {
        font-weight: var(--sf-weight-semibold);
        font-size: var(--sf-text-base);
        margin-bottom: var(--sf-space-3);
        padding: 0;
      }
      .kc__options {
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-2);
      }
      .kc .sf-option {
        min-height: 44px;
      }
      .kc__link {
        min-height: 44px;
      }
      .kc__after:focus-visible,
      .kc__qprompt:focus-visible {
        outline: 3px solid rgba(220, 72, 27, 0.45);
        outline-offset: 2px;
      }
      .kc .sf-option:focus-visible,
      .kc__input:focus-visible {
        outline: 3px solid rgba(220, 72, 27, 0.45);
        outline-offset: 2px;
      }
      .kc .sf-option[aria-checked='true'] {
        border-color: var(--sf-ember);
      }
      .kc__label {
        display: block;
        margin-bottom: var(--sf-space-2);
        font-size: var(--sf-text-sm);
      }
      .kc__input {
        width: 100%;
        min-height: 44px;
        padding: 0 var(--sf-space-3);
        border: 1.5px solid var(--sf-line);
        border-radius: var(--sf-radius-md);
        font: inherit;
        background: var(--sf-surface);
        color: var(--sf-ink);
      }
      .kc__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sf-space-3);
      }
      .kc__error {
        color: var(--sf-danger);
        margin: 0;
        font-weight: var(--sf-weight-semibold);
      }
      .kc__feedback--wrong {
        background: var(--sf-danger-soft);
        color: var(--sf-ink);
      }
      .kc__note {
        margin: 0;
        padding: var(--sf-space-3);
        background: var(--sf-muted-bg);
        border-radius: var(--sf-radius-md);
      }
      .kc__sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .kc__hint {
        margin: 0 0 var(--sf-space-2);
      }
      .kc__order {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-2);
      }
      .kc__order-item,
      .kc__match-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sf-space-2) var(--sf-space-3);
        min-height: 44px;
        padding: var(--sf-space-2) var(--sf-space-3);
        border: 1.5px solid var(--sf-line);
        border-radius: var(--sf-radius-md);
        background: var(--sf-surface);
      }
      .kc__order-item.is-correct,
      .kc__match-row.is-correct {
        border-color: var(--sf-success);
      }
      .kc__order-item.is-wrong,
      .kc__match-row.is-wrong {
        border-color: var(--sf-danger);
      }
      .kc__order-text,
      .kc__match-left {
        flex: 1 1 12rem;
        min-width: 0;
      }
      .kc__order-moves {
        display: flex;
        gap: var(--sf-space-1);
      }
      .kc__order-moves .sf-btn {
        min-height: 44px;
      }
      .kc__match {
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-2);
      }
      .kc__select {
        flex: 1 1 12rem;
        width: auto;
      }
      .kc__result {
        padding: var(--sf-space-4);
        background: var(--sf-muted-bg);
        border-radius: var(--sf-radius-md);
      }
    `,
  ],
  imports: [NgTemplateOutlet, RouterLink],
})
export class KnowledgeCheckComponent {
  private readonly api = inject(LearningApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly lessonId = input.required<string>();
  /** When set, blocking messages link back to the course. */
  readonly courseId = input<string>('');
  readonly quiz = input.required<ApiLessonQuiz>();
  /** Emitted whenever the server reports lesson completion. */
  readonly completed = output<ApiCompletion>();

  /** Selected option ids per question. */
  readonly selections = signal<Record<string, string[]>>({});
  readonly texts = signal<Record<string, string>>({});
  /** Ordering: the learner's current arrangement of option ids per question. */
  readonly orders = signal<Record<string, string[]>>({});
  /** Matching: chosen right-hand item per left-hand item, per question. */
  readonly matches = signal<Record<string, Record<string, string>>>({});
  /** Screen-reader announcement of the last move, per ordering question. */
  readonly moved = signal<Record<string, string>>({});
  /** Graded mode: the key for the submission being sent, reused when it is resent. */
  private pending: { key: string; body: string } | null = null;
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  /** Check mode: latest server answer for the shown question. */
  readonly result = signal<ApiCheckResult | null>(null);
  /** Question ids solved during this session (plus restored ones). */
  private readonly solvedNow = signal<ReadonlySet<string>>(new Set());
  /** Check mode: question id the learner chose to revisit, else first unsolved. */
  private readonly cursor = signal<string | null>(null);
  readonly attempt = signal<ApiAttemptResult | null>(null);

  readonly perQuestion = computed(() => {
    const map: Record<string, { correct: boolean }> = {};
    for (const p of this.attempt()?.perQuestion ?? []) map[p.questionId] = p;
    return map;
  });

  private isSolved(id: string): boolean {
    return this.solvedNow().has(id) || !!this.quiz().answered[id]?.solved;
  }

  readonly current = computed<ApiQuestion | null>(() => {
    const qs = this.quiz().questions;
    const cursor = this.cursor();
    if (cursor) return qs.find((q) => q.id === cursor) ?? null;
    return qs.find((q) => !this.isSolved(q.id)) ?? null;
  });

  readonly position = computed(() => {
    const cur = this.current();
    return cur ? this.quiz().questions.findIndex((q) => q.id === cur.id) + 1 : 0;
  });

  readonly hasNext = computed(() => {
    const cur = this.current();
    return !!cur && this.quiz().questions.some((q) => q.id !== cur.id && !this.isSolved(q.id));
  });

  /** Choices are read-only while a request is in flight or after a solved/passed state. */
  readonly locked = computed(() => {
    if (this.busy()) return true;
    if (this.quiz().mode === 'graded') return false;
    return !!this.result()?.solved;
  });

  readonly allAnswered = computed(() =>
    this.quiz().questions.every((q) => !this.isSupported(q) || this.hasAnswer(q)),
  );

  /** Questions this app cannot answer block completion and must not burn attempts. */
  readonly hasUnsupported = computed(() => this.quiz().questions.some((q) => !this.isSupported(q)));

  /** Move focus after the next render; used when the focused control is removed. */
  private focusSoon(selector: string): void {
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), {
      injector: this.injector,
    });
  }

  /** Roving tabindex for single-choice radios: the selected (else first) option is the stop. */
  tabStop(q: ApiQuestion, optionId: string, index: number): number | null {
    if (q.type === 'multi_select') return null;
    const sel = this.selections()[q.id] ?? [];
    return (sel.length ? sel[0] === optionId : index === 0) ? 0 : -1;
  }

  /** Arrow/Home/End selection for the radiogroup pattern. */
  onOptionKey(event: KeyboardEvent, q: ApiQuestion, index: number): void {
    if (q.type === 'multi_select') return;
    const n = q.options.length;
    let to = -1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        to = (index + 1) % n;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        to = (index - 1 + n) % n;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = n - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.toggle(q, q.options[to].id);
    ((event.currentTarget as HTMLElement).parentElement?.children[to] as HTMLElement)?.focus();
  }

  isSupported(q: ApiQuestion): boolean {
    return SUPPORTED.includes(q.type);
  }

  letter(i: number): string {
    return String.fromCharCode(65 + i);
  }

  isSelected(qid: string, oid: string): boolean {
    return (this.selections()[qid] ?? []).includes(oid);
  }

  markCorrect(qid: string): boolean {
    const r = this.result();
    return !!r && r.questionId === qid && r.correct;
  }

  markWrong(qid: string): boolean {
    const r = this.result();
    return !!r && r.questionId === qid && !r.correct;
  }

  hasAnswer(q: ApiQuestion): boolean {
    if (q.type === 'fill_in') return (this.texts()[q.id] ?? '').trim().length > 0;
    // An arrangement always exists; leaving the shown order is a valid answer.
    if (q.type === 'ordering') return q.options.length > 0;
    if (q.type === 'matching') {
      const chosen = this.matches()[q.id] ?? {};
      const left = q.matching?.left ?? [];
      return left.length > 0 && left.every((l) => !!chosen[l]);
    }
    return (this.selections()[q.id] ?? []).length > 0;
  }

  orderOf(q: ApiQuestion): string[] {
    return this.orders()[q.id] ?? q.options.map((o) => o.id);
  }

  optionText(q: ApiQuestion, id: string): string {
    return q.options.find((o) => o.id === id)?.text ?? '';
  }

  move(q: ApiQuestion, index: number, by: -1 | 1): void {
    const order = [...this.orderOf(q)];
    const to = index + by;
    if (to < 0 || to >= order.length) return;
    [order[index], order[to]] = [order[to], order[index]];
    this.orders.update((o) => ({ ...o, [q.id]: order }));
    this.moved.update((m) => ({
      ...m,
      [q.id]: `${this.optionText(q, order[to])} moved to position ${to + 1} of ${order.length}.`,
    }));
    this.result.set(null);
    // Keep focus on the moved item: the same-direction button, or the other one when the
    // item reached an end and that button became disabled.
    const itemId = `kc-item-${q.id}-${order[to]}`;
    afterNextRender(
      () => {
        const text = Array.from(
          this.host.nativeElement.querySelectorAll<HTMLElement>('.kc__order-text'),
        ).find((el) => el.id === itemId);
        const [up, down] = Array.from(
          text?.parentElement?.querySelectorAll<HTMLButtonElement>('.kc__order-moves button') ?? [],
        );
        const preferred = by < 0 ? up : down;
        (preferred && !preferred.disabled ? preferred : by < 0 ? down : up)?.focus();
      },
      { injector: this.injector },
    );
  }

  setMatch(qid: string, left: string, right: string): void {
    this.matches.update((m) => {
      const cur = { ...(m[qid] ?? {}) };
      if (right) cur[left] = right;
      else delete cur[left];
      return { ...m, [qid]: cur };
    });
    this.result.set(null);
  }

  canCheck(q: ApiQuestion): boolean {
    return this.isSupported(q) && this.hasAnswer(q);
  }

  setText(qid: string, value: string): void {
    this.texts.update((t) => ({ ...t, [qid]: value }));
    this.result.set(null);
  }

  toggle(q: ApiQuestion, optionId: string): void {
    this.selections.update((s) => {
      const cur = s[q.id] ?? [];
      if (q.type === 'multi_select') {
        return {
          ...s,
          [q.id]: cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId],
        };
      }
      return { ...s, [q.id]: [optionId] };
    });
    this.result.set(null);
  }

  headline(r: ApiCheckResult): string {
    if (r.correct) return r.firstTry ? 'Correct on your first try.' : 'Correct. This was a retry.';
    return 'Not quite. Review the question and try again.';
  }

  private answerFor(q: ApiQuestion): ApiAnswer {
    if (q.type === 'fill_in') return { questionId: q.id, text: (this.texts()[q.id] ?? '').trim() };
    if (q.type === 'ordering') return { questionId: q.id, order: this.orderOf(q) };
    if (q.type === 'matching') {
      const chosen = this.matches()[q.id] ?? {};
      return {
        questionId: q.id,
        selectedOptionIds: (q.matching?.left ?? []).map((l) => `${l}:${chosen[l] ?? ''}`),
      };
    }
    return { questionId: q.id, selectedOptionIds: this.selections()[q.id] ?? [] };
  }

  async check(q: ApiQuestion): Promise<void> {
    if (this.busy() || !this.canCheck(q)) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.check(this.lessonId(), this.answerFor(q));
      this.result.set(res);
      if (res.solved) {
        this.solvedNow.update((s) => new Set(s).add(q.id));
        if (!this.cursor()) this.cursor.set(q.id); // stay on this question until "Next"
        this.focusSoon('.kc__after'); // the Check button is replaced by Next / done
      }
      if (res.completion) this.completed.emit(res.completion);
    } catch (e) {
      this.error.set(apiErrorMessage(e, 'Could not check your answer. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }

  next(): void {
    this.cursor.set(null);
    this.result.set(null);
    this.focusSoon('legend.kc__qprompt');
  }

  retry(): void {
    this.attempt.set(null);
    this.selections.set({});
    this.texts.set({});
    this.orders.set({});
    this.matches.set({});
    this.moved.set({});
    this.error.set(null);
    this.focusSoon('legend.kc__qprompt');
  }

  async submit(): Promise<void> {
    if (this.busy() || this.hasUnsupported() || !this.allAnswered()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const responses = this.quiz()
        .questions.filter((q) => this.isSupported(q))
        .map((q) => this.answerFor(q));
      // Resending the same answers after a lost response reuses the key, so the server
      // returns the attempt it already graded instead of spending another one.
      const body = JSON.stringify(responses);
      if (this.pending?.body !== body) this.pending = { key: crypto.randomUUID(), body };
      const res = await this.api.submitQuiz(this.lessonId(), responses, this.pending.key);
      this.pending = null;
      this.attempt.set(res);
      if (res.passed || res.attemptsRemaining === 0) this.focusSoon('.kc__after'); // button removed
      if (res.completion) this.completed.emit(res.completion);
    } catch (e) {
      // A definite answer from the server (4xx) ends this submission; keep the key only
      // when the outcome is unknown (offline, timeout, 5xx).
      if (e instanceof HttpErrorResponse && e.status >= 400 && e.status < 500) this.pending = null;
      this.error.set(apiErrorMessage(e, 'Could not submit the quiz. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }
}
