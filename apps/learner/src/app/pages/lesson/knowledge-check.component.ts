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

const SUPPORTED: readonly ApiQuestion['type'][] = ['mcq', 'true_false', 'multi_select', 'fill_in'];

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
    return (this.selections()[q.id] ?? []).length > 0;
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
    return q.type === 'fill_in'
      ? { questionId: q.id, text: (this.texts()[q.id] ?? '').trim() }
      : { questionId: q.id, selectedOptionIds: this.selections()[q.id] ?? [] };
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
      const res = await this.api.submitQuiz(this.lessonId(), responses);
      this.attempt.set(res);
      if (res.passed || res.attemptsRemaining === 0) this.focusSoon('.kc__after'); // button removed
      if (res.completion) this.completed.emit(res.completion);
    } catch (e) {
      this.error.set(apiErrorMessage(e, 'Could not submit the quiz. Please try again.'));
    } finally {
      this.busy.set(false);
    }
  }
}
