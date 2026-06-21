import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QuizRepository } from '@assurance/data-access';
import { QuizSubmissionService } from '@assurance/lms-core';
import { IndexedDbStore, isIndexedDbAvailable } from '@assurance/shared';
import type { Quiz, QuizGrade, QuizQuestion, QuizResponse } from '@assurance/shared';

/** Per-question local UI state used to collect responses. */
interface QuestionState {
  question: QuizQuestion;
  /** For mcq / true_false: the chosen option id. */
  selectedSingle: string;
  /** For multi_select: set of chosen option ids. */
  selectedMulti: Set<string>;
  /** For fill_in. */
  fillText: string;
  /** For ordering: current order of option ids (dragged / re-ordered). */
  orderIds: string[];
  /** For matching: map left-option-id → chosen right-option-id. */
  matchMap: Map<string, string>;
}

/** Serialisable per-question draft (Set/Map flattened to arrays for IndexedDB). */
interface QuestionDraft {
  questionId: string;
  selectedSingle: string;
  selectedMulti: string[];
  fillText: string;
  orderIds: string[];
  matchPairs: Array<[string, string]>;
}

/** A persisted in-progress quiz attempt. */
interface QuizDraft {
  key: string;
  savedAt: string;
  answers: QuestionDraft[];
}

// Own database (a single store): every offline feature uses a dedicated IndexedDB
// database to avoid the multi-store-same-version footgun (see IndexedDbStore).
const DRAFT_DB = 'assurance.quiz-drafts';
const DRAFT_STORE = 'quiz-drafts';
const AUTOSAVE_DEBOUNCE_MS = 600;

function stateToDraft(s: QuestionState): QuestionDraft {
  return {
    questionId: s.question.id,
    selectedSingle: s.selectedSingle,
    selectedMulti: [...s.selectedMulti],
    fillText: s.fillText,
    orderIds: [...s.orderIds],
    matchPairs: [...s.matchMap.entries()],
  };
}

/** Re-apply a saved draft onto freshly-built question states (in place). */
function applyDraft(states: QuestionState[], draft: QuizDraft): void {
  const byId = new Map(draft.answers.map((a) => [a.questionId, a]));
  for (const st of states) {
    const a = byId.get(st.question.id);
    if (!a) continue;
    st.selectedSingle = a.selectedSingle;
    st.selectedMulti = new Set(a.selectedMulti);
    st.fillText = a.fillText;
    // Only trust a saved order that still matches the question's option set.
    if (a.orderIds.length === st.orderIds.length) {
      const valid = new Set(st.orderIds);
      if (a.orderIds.every((id) => valid.has(id))) st.orderIds = [...a.orderIds];
    }
    st.matchMap = new Map(a.matchPairs);
  }
}

function makeState(q: QuizQuestion): QuestionState {
  return {
    question: q,
    selectedSingle: '',
    selectedMulti: new Set<string>(),
    fillText: '',
    orderIds: q.options.map((o) => o.id),
    matchMap: new Map<string, string>(),
  };
}

function stateToResponse(s: QuestionState): QuizResponse {
  const q = s.question;
  switch (q.type) {
    case 'mcq':
    case 'true_false':
      return {
        questionId: q.id,
        selectedOptionIds: s.selectedSingle ? [s.selectedSingle] : [],
      };
    case 'multi_select':
      return { questionId: q.id, selectedOptionIds: [...s.selectedMulti] };
    case 'fill_in':
      return { questionId: q.id, text: s.fillText };
    case 'ordering':
      return { questionId: q.id, order: s.orderIds };
    case 'matching': {
      const pairs = [...s.matchMap.entries()].map(([l, r]) => `${l}:${r}`);
      return { questionId: q.id, selectedOptionIds: pairs };
    }
    default:
      return { questionId: q.id };
  }
}

/** Labels for the two matching "columns" parsed from option text ("left|right"). */
function matchOptions(q: QuizQuestion): { lefts: string[]; rights: string[] } {
  const lefts = q.options.map((o) => o.text.split('|')[0] ?? o.text);
  const rights = q.options.map((o) => o.text.split('|')[1] ?? '');
  return { lefts, rights };
}

@Component({
  selector: 'assurance-quiz-player',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quiz-player">
      @if (loading()) {
        <p class="quiz-player__status">Loading quiz…</p>
      } @else if (error()) {
        <p class="quiz-player__error">{{ error() }}</p>
      } @else if (quiz()) {
        <h2 class="quiz-player__title">{{ quiz()!.title }}</h2>

        @for (qs of questionStates(); track qs.question.id; let i = $index) {
          <div
            class="quiz-player__question"
            [class.quiz-player__question--correct]="correctnessFor(qs.question.id) === true"
            [class.quiz-player__question--incorrect]="correctnessFor(qs.question.id) === false"
          >
            <p class="quiz-player__prompt">{{ i + 1 }}. {{ qs.question.prompt }}</p>

            @switch (qs.question.type) {
              @case ('mcq') {
                @for (opt of qs.question.options; track opt.id) {
                  <label class="quiz-player__option">
                    <input
                      type="radio"
                      [name]="'q-' + qs.question.id"
                      [value]="opt.id"
                      [disabled]="submitted()"
                      [(ngModel)]="qs.selectedSingle"
                      (ngModelChange)="scheduleAutosave()"
                    />
                    {{ opt.text }}
                  </label>
                }
              }
              @case ('true_false') {
                @for (opt of qs.question.options; track opt.id) {
                  <label class="quiz-player__option">
                    <input
                      type="radio"
                      [name]="'q-' + qs.question.id"
                      [value]="opt.id"
                      [disabled]="submitted()"
                      [(ngModel)]="qs.selectedSingle"
                      (ngModelChange)="scheduleAutosave()"
                    />
                    {{ opt.text }}
                  </label>
                }
              }
              @case ('multi_select') {
                @for (opt of qs.question.options; track opt.id) {
                  <label class="quiz-player__option">
                    <input
                      type="checkbox"
                      [value]="opt.id"
                      [disabled]="submitted()"
                      [checked]="qs.selectedMulti.has(opt.id)"
                      (change)="toggleMulti(qs, opt.id, $any($event.target).checked)"
                    />
                    {{ opt.text }}
                  </label>
                }
              }
              @case ('fill_in') {
                <input
                  class="quiz-player__text-input"
                  type="text"
                  placeholder="Your answer…"
                  [disabled]="submitted()"
                  [(ngModel)]="qs.fillText"
                  (ngModelChange)="scheduleAutosave()"
                />
              }
              @case ('ordering') {
                <ol class="quiz-player__order-list">
                  @for (optId of qs.orderIds; track optId; let j = $index) {
                    <li class="quiz-player__order-item">
                      <span>{{ labelForOptionId(qs.question, optId) }}</span>
                      @if (!submitted()) {
                        <span class="quiz-player__order-controls">
                          <button
                            type="button"
                            [attr.aria-label]="
                              'Move ' + labelForOptionId(qs.question, optId) + ' up'
                            "
                            [disabled]="j === 0"
                            (click)="moveUp(qs, j)"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            [attr.aria-label]="
                              'Move ' + labelForOptionId(qs.question, optId) + ' down'
                            "
                            [disabled]="j === qs.orderIds.length - 1"
                            (click)="moveDown(qs, j)"
                          >
                            ↓
                          </button>
                        </span>
                      }
                    </li>
                  }
                </ol>
              }
              @case ('matching') {
                @for (opt of qs.question.options; track opt.id; let k = $index) {
                  <div class="quiz-player__match-row">
                    <span class="quiz-player__match-left">{{
                      matchOptions(qs.question).lefts[k]
                    }}</span>
                    <select
                      class="quiz-player__match-select"
                      [disabled]="submitted()"
                      [value]="qs.matchMap.get(opt.id) ?? ''"
                      (change)="setMatch(qs, opt.id, $any($event.target).value)"
                    >
                      <option value="">— select —</option>
                      @for (right of matchOptions(qs.question).rights; track right) {
                        <option [value]="opt.id + ':' + right">{{ right }}</option>
                      }
                    </select>
                  </div>
                }
              }
            }

            @if (submitted() && grade()) {
              <p
                class="quiz-player__feedback"
                [class.quiz-player__feedback--correct]="correctnessFor(qs.question.id)"
                [class.quiz-player__feedback--incorrect]="!correctnessFor(qs.question.id)"
              >
                {{ correctnessFor(qs.question.id) ? '✓ Correct' : '✗ Incorrect' }}
              </p>
            }
          </div>
        }

        @if (!submitted()) {
          <button
            class="quiz-player__submit"
            type="button"
            [disabled]="submitting()"
            (click)="onSubmit()"
          >
            {{ submitting() ? 'Submitting…' : 'Submit Quiz' }}
          </button>
        }

        @if (grade(); as g) {
          <div class="quiz-player__grade" [class.quiz-player__grade--passed]="g.passed">
            <p class="quiz-player__score">
              Score: {{ g.scorePct }}% — {{ g.passed ? 'Passed ✓' : 'Failed ✗' }}
            </p>
            <p class="quiz-player__points">{{ g.earnedPoints }} / {{ g.totalPoints }} points</p>
          </div>
        }

        @if (queuedOffline()) {
          <p class="quiz-player__queued" role="status" aria-live="polite">
            Submitted — will sync when you're back online.
          </p>
        }

        @if (submitError()) {
          <p class="quiz-player__error">{{ submitError() }}</p>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .quiz-player {
        max-width: 48rem;
        margin: 0 auto;
        padding: 1rem;
      }
      .quiz-player__title {
        margin-bottom: 1.5rem;
        font-size: 1.25rem;
        font-weight: 700;
      }
      .quiz-player__question {
        margin-bottom: 1.5rem;
        padding: 1rem;
        border: 1px solid var(--assurance-border, #e5e7eb);
        border-radius: 0.5rem;
      }
      .quiz-player__question--correct {
        border-color: var(--assurance-success, #22c55e);
      }
      .quiz-player__question--incorrect {
        border-color: var(--assurance-error, #ef4444);
      }
      .quiz-player__prompt {
        font-weight: 600;
        margin-bottom: 0.75rem;
      }
      .quiz-player__option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.375rem;
        cursor: pointer;
      }
      .quiz-player__text-input {
        width: 100%;
        padding: 0.375rem 0.5rem;
        border: 1px solid var(--assurance-border, #e5e7eb);
        border-radius: 0.375rem;
        font-size: 0.875rem;
      }
      .quiz-player__order-list {
        list-style: decimal inside;
        padding: 0;
        margin: 0;
      }
      .quiz-player__order-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.375rem 0.5rem;
        margin-bottom: 0.25rem;
        background: var(--assurance-surface, #f9fafb);
        border-radius: 0.25rem;
      }
      .quiz-player__order-controls {
        display: flex;
        gap: 0.25rem;
      }
      .quiz-player__order-controls button {
        /* >= 44x44px touch target (MO-03). */
        min-width: 44px;
        min-height: 44px;
        padding: 0.25rem 0.5rem;
        font-size: 1rem;
        cursor: pointer;
      }
      .quiz-player__order-controls button:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .quiz-player__match-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.375rem;
      }
      .quiz-player__match-left {
        min-width: 8rem;
        font-weight: 500;
      }
      .quiz-player__match-select {
        flex: 1;
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--assurance-border, #e5e7eb);
        border-radius: 0.375rem;
      }
      .quiz-player__feedback {
        margin-top: 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
      }
      .quiz-player__feedback--correct {
        color: var(--assurance-success, #22c55e);
      }
      .quiz-player__feedback--incorrect {
        color: var(--assurance-error, #ef4444);
      }
      .quiz-player__submit {
        display: block;
        margin: 1.5rem 0;
        padding: 0.625rem 1.5rem;
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
        border: none;
        border-radius: 0.375rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      }
      .quiz-player__submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .quiz-player__grade {
        padding: 1rem;
        border: 2px solid var(--assurance-error, #ef4444);
        border-radius: 0.5rem;
        margin-top: 1rem;
      }
      .quiz-player__grade--passed {
        border-color: var(--assurance-success, #22c55e);
      }
      .quiz-player__score {
        font-size: 1.125rem;
        font-weight: 700;
      }
      .quiz-player__points {
        font-size: 0.875rem;
        color: var(--assurance-text-muted, #666);
      }
      .quiz-player__status,
      .quiz-player__error {
        color: var(--assurance-text-muted, #666);
        font-style: italic;
      }
      .quiz-player__error {
        color: var(--assurance-error, #ef4444);
      }
      .quiz-player__queued {
        margin-top: 1rem;
        padding: 0.625rem 0.875rem;
        border-radius: 0.375rem;
        background: var(--assurance-info-bg, #1e3a8a);
        color: #fff;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class QuizPlayerComponent implements OnInit {
  readonly quizId = input.required<string>();
  readonly courseId = input.required<string>();
  readonly moduleId = input.required<string>();
  readonly tenantId = input.required<string>();
  readonly uid = input.required<string>();

  private readonly quizRepo = inject(QuizRepository);
  private readonly submissionSvc = inject(QuizSubmissionService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly draftStore = new IndexedDbStore<QuizDraft>(DRAFT_DB, DRAFT_STORE);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly quiz = signal<Quiz | null>(null);
  protected readonly questionStates = signal<QuestionState[]>([]);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly grade = signal<QuizGrade | null>(null);
  /** Set when an attempt is queued offline (shows the sync notice). */
  protected readonly queuedOffline = signal(false);

  /** Debounce handle for autosave. */
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // When an attempt that was queued offline is later graded on reconnect,
    // reconcile the displayed grade for THIS quiz so the learner sees their
    // real score without a reload (FIX-6).
    const unsubscribe = this.submissionSvc.onReconciled((quizId, grade) => {
      if (quizId === this.quizId()) {
        this.grade.set(grade);
        this.queuedOffline.set(false);
        this.submitted.set(true);
      }
    });

    destroyRef.onDestroy(() => {
      unsubscribe();
      if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    });
  }

  /** Stable draft key: tenantId:uid:quizId (per the MO-08 spec). */
  private draftKey(): string {
    return `${this.tenantId()}:${this.uid()}:${this.quizId()}`;
  }

  protected readonly correctnessMap = computed(() => {
    const g = this.grade();
    if (!g) return new Map<string, boolean>();
    return new Map(g.perQuestion.map((pq) => [pq.questionId, pq.correct]));
  });

  protected correctnessFor(questionId: string): boolean | undefined {
    return this.correctnessMap().get(questionId);
  }

  async ngOnInit(): Promise<void> {
    try {
      const q = await this.quizRepo.getById(this.tenantId(), this.quizId());
      if (!q) {
        this.error.set('Quiz not found.');
        return;
      }
      this.quiz.set(q);
      const states = q.questions.map(makeState);

      // Restore an in-progress draft saved in a prior session (MO-08).
      if (this.isBrowser && isIndexedDbAvailable()) {
        try {
          const draft = await this.draftStore.get(this.draftKey());
          if (draft) applyDraft(states, draft);
        } catch (err) {
          console.warn('[QuizPlayerComponent] Failed to restore draft', err);
        }
      }

      this.questionStates.set(states);
    } catch (err) {
      console.error('[QuizPlayerComponent] Failed to load quiz', err);
      this.error.set('Failed to load quiz. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Schedule a debounced autosave of the current answers to IndexedDB. */
  protected scheduleAutosave(): void {
    // Never re-arm an autosave once a submit is in flight or done: otherwise a
    // late `ngModelChange` could schedule a `saveDraft` that runs AFTER
    // `clearDraft()` and resurrect a submitted attempt on next load (FIX-4).
    if (!this.isBrowser || this.submitting() || this.submitted()) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.saveDraft(), AUTOSAVE_DEBOUNCE_MS);
  }

  /** Persist the current answer state now. Safe no-op without IndexedDB. */
  private async saveDraft(): Promise<void> {
    // Guard again at write time: a timer scheduled just before submit could fire
    // during the in-flight submit, after the draft was (or is about to be) cleared.
    if (this.submitting() || this.submitted()) return;
    if (!isIndexedDbAvailable()) return;
    const draft: QuizDraft = {
      key: this.draftKey(),
      savedAt: new Date().toISOString(),
      answers: this.questionStates().map(stateToDraft),
    };
    try {
      await this.draftStore.put(draft.key, draft);
    } catch {
      // Quota / unavailable — drop the autosave silently; the volatile state is
      // still intact and a later autosave may succeed.
    }
  }

  /** Remove the saved draft (called after a successful or queued submit). */
  private async clearDraft(): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    await this.draftStore.delete(this.draftKey()).catch(() => undefined);
  }

  protected toggleMulti(qs: QuestionState, optId: string, checked: boolean): void {
    if (checked) {
      qs.selectedMulti.add(optId);
    } else {
      qs.selectedMulti.delete(optId);
    }
    // Trigger signal update by replacing the array
    this.questionStates.update((states) => [...states]);
    this.scheduleAutosave();
  }

  protected moveUp(qs: QuestionState, index: number): void {
    if (index <= 0) return;
    const ids = [...qs.orderIds];
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    qs.orderIds = ids;
    this.questionStates.update((states) => [...states]);
    this.scheduleAutosave();
  }

  protected moveDown(qs: QuestionState, index: number): void {
    if (index >= qs.orderIds.length - 1) return;
    const ids = [...qs.orderIds];
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    qs.orderIds = ids;
    this.questionStates.update((states) => [...states]);
    this.scheduleAutosave();
  }

  protected setMatch(qs: QuestionState, leftId: string, value: string): void {
    if (value) {
      qs.matchMap.set(leftId, value);
    } else {
      qs.matchMap.delete(leftId);
    }
    this.questionStates.update((states) => [...states]);
    this.scheduleAutosave();
  }

  protected labelForOptionId(q: QuizQuestion, optId: string): string {
    return q.options.find((o) => o.id === optId)?.text ?? optId;
  }

  protected matchOptions(q: QuizQuestion): { lefts: string[]; rights: string[] } {
    return matchOptions(q);
  }

  async onSubmit(): Promise<void> {
    if (this.submitting() || this.submitted()) return;

    const states = this.questionStates();
    const responses: QuizResponse[] = states.map(stateToResponse);

    // Cancel any pending autosave; we're about to finalise the attempt.
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      const outcome = await this.submissionSvc.submitWithOutbox({
        tenantId: this.tenantId(),
        courseId: this.courseId(),
        moduleId: this.moduleId(),
        quizId: this.quizId(),
        responses,
      });

      if (outcome.graded && outcome.grade) {
        this.grade.set(outcome.grade);
      } else if (outcome.queued) {
        // Offline / transient failure: the attempt is safely queued and will be
        // graded on reconnect (grading stays server-authoritative).
        this.queuedOffline.set(true);
      } else {
        // Neither graded nor durably persisted (IndexedDB absent/quota): do NOT
        // claim durability. Keep the draft and let the learner retry (FIX-8).
        this.submitError.set('Could not save your attempt. Please try again.');
        return;
      }
      this.submitted.set(true);
      // The attempt is now either graded or durably queued — drop the draft.
      await this.clearDraft();
    } catch (err) {
      console.error('[QuizPlayerComponent] Submit failed', err);
      this.submitError.set('Submission failed. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
