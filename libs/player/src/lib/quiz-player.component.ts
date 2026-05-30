import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QuizRepository } from '@assurance/data-access';
import { QuizSubmissionService } from '@assurance/lms-core';
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
  selector: 'forge-quiz-player',
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
                />
              }
              @case ('ordering') {
                <ol class="quiz-player__order-list">
                  @for (optId of qs.orderIds; track optId; let j = $index) {
                    <li class="quiz-player__order-item">
                      <span>{{ labelForOptionId(qs.question, optId) }}</span>
                      @if (!submitted()) {
                        <span class="quiz-player__order-controls">
                          <button type="button" [disabled]="j === 0" (click)="moveUp(qs, j)">
                            ↑
                          </button>
                          <button
                            type="button"
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
        border: 1px solid var(--forge-border, #e5e7eb);
        border-radius: 0.5rem;
      }
      .quiz-player__question--correct {
        border-color: var(--forge-success, #22c55e);
      }
      .quiz-player__question--incorrect {
        border-color: var(--forge-error, #ef4444);
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
        border: 1px solid var(--forge-border, #e5e7eb);
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
        background: var(--forge-surface, #f9fafb);
        border-radius: 0.25rem;
      }
      .quiz-player__order-controls {
        display: flex;
        gap: 0.25rem;
      }
      .quiz-player__order-controls button {
        padding: 0.125rem 0.375rem;
        cursor: pointer;
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
        border: 1px solid var(--forge-border, #e5e7eb);
        border-radius: 0.375rem;
      }
      .quiz-player__feedback {
        margin-top: 0.5rem;
        font-size: 0.875rem;
        font-weight: 600;
      }
      .quiz-player__feedback--correct {
        color: var(--forge-success, #22c55e);
      }
      .quiz-player__feedback--incorrect {
        color: var(--forge-error, #ef4444);
      }
      .quiz-player__submit {
        display: block;
        margin: 1.5rem 0;
        padding: 0.625rem 1.5rem;
        background: var(--forge-primary, #0b5fff);
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
        border: 2px solid var(--forge-error, #ef4444);
        border-radius: 0.5rem;
        margin-top: 1rem;
      }
      .quiz-player__grade--passed {
        border-color: var(--forge-success, #22c55e);
      }
      .quiz-player__score {
        font-size: 1.125rem;
        font-weight: 700;
      }
      .quiz-player__points {
        font-size: 0.875rem;
        color: var(--forge-text-muted, #666);
      }
      .quiz-player__status,
      .quiz-player__error {
        color: var(--forge-text-muted, #666);
        font-style: italic;
      }
      .quiz-player__error {
        color: var(--forge-error, #ef4444);
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

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly quiz = signal<Quiz | null>(null);
  protected readonly questionStates = signal<QuestionState[]>([]);
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly grade = signal<QuizGrade | null>(null);

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
      this.questionStates.set(q.questions.map(makeState));
    } catch (err) {
      console.error('[QuizPlayerComponent] Failed to load quiz', err);
      this.error.set('Failed to load quiz. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleMulti(qs: QuestionState, optId: string, checked: boolean): void {
    if (checked) {
      qs.selectedMulti.add(optId);
    } else {
      qs.selectedMulti.delete(optId);
    }
    // Trigger signal update by replacing the array
    this.questionStates.update((states) => [...states]);
  }

  protected moveUp(qs: QuestionState, index: number): void {
    if (index <= 0) return;
    const ids = [...qs.orderIds];
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    qs.orderIds = ids;
    this.questionStates.update((states) => [...states]);
  }

  protected moveDown(qs: QuestionState, index: number): void {
    if (index >= qs.orderIds.length - 1) return;
    const ids = [...qs.orderIds];
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    qs.orderIds = ids;
    this.questionStates.update((states) => [...states]);
  }

  protected setMatch(qs: QuestionState, leftId: string, value: string): void {
    if (value) {
      qs.matchMap.set(leftId, value);
    } else {
      qs.matchMap.delete(leftId);
    }
    this.questionStates.update((states) => [...states]);
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

    this.submitting.set(true);
    this.submitError.set(null);

    try {
      const grade = await this.submissionSvc.submit({
        tenantId: this.tenantId(),
        courseId: this.courseId(),
        moduleId: this.moduleId(),
        quizId: this.quizId(),
        responses,
      });
      this.grade.set(grade);
      this.submitted.set(true);
    } catch (err) {
      console.error('[QuizPlayerComponent] Submit failed', err);
      this.submitError.set('Submission failed. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
