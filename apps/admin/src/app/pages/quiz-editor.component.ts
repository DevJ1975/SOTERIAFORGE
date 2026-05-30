import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { QuizRepository } from '@assurance/data-access';
import { TenantService } from '@assurance/auth';
import { QUESTION_TYPES, type QuestionType } from '@assurance/shared';
import type { Quiz, QuizQuestion } from '@assurance/shared';

/** Question types that use option-based answers (radio/checkbox style). */
const CHOICE_TYPES: readonly QuestionType[] = ['mcq', 'multi_select', 'true_false'];

@Component({
  selector: 'assurance-admin-quiz-editor',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    SelectModule,
    CheckboxModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="quiz-editor">
      <nav class="quiz-editor__nav">
        <a routerLink="/quizzes">← Back to Quizzes</a>
      </nav>

      @if (loadError()) {
        <p class="quiz-editor__error">{{ loadError() }}</p>
      } @else if (loading()) {
        <p>Loading quiz…</p>
      } @else if (quiz()) {
        <h1>{{ quiz()!.title }}</h1>

        <!-- Quiz Settings -->
        <div class="quiz-editor__settings">
          <h2>Settings</h2>
          <div class="quiz-editor__settings-row">
            <label>
              Pass threshold (%)
              <p-inputNumber
                [(ngModel)]="editPassThreshold"
                [min]="0"
                [max]="100"
                aria-label="Pass threshold percent"
              />
            </label>
            <label class="quiz-editor__checkbox-label">
              <p-checkbox [(ngModel)]="editRandomize" [binary]="true" inputId="randomize" />
              Randomize question order
            </label>
          </div>
          <p-button
            label="Save Settings"
            severity="secondary"
            size="small"
            [loading]="savingSettings()"
            (onClick)="saveSettings()"
          />
          @if (saveSettingsError()) {
            <p class="quiz-editor__error">{{ saveSettingsError() }}</p>
          }
        </div>

        <!-- Add Question Form -->
        <div class="quiz-editor__add-question">
          <h2>Add Question</h2>
          <div class="quiz-editor__add-form">
            <p-select
              [options]="questionTypeOptions"
              [(ngModel)]="newQuestionType"
              placeholder="Question type"
              aria-label="Question type"
            />
            <input
              pInputText
              type="text"
              placeholder="Question prompt"
              [(ngModel)]="newQuestionPrompt"
              aria-label="Question prompt"
            />
            <p-inputNumber
              [(ngModel)]="newQuestionPoints"
              [min]="1"
              placeholder="Points"
              aria-label="Points"
            />
            <p-button
              label="Add Question"
              [disabled]="!newQuestionType || !newQuestionPrompt.trim()"
              (onClick)="addQuestion()"
            />
          </div>
        </div>

        <!-- Questions List -->
        <h2>Questions ({{ quiz()!.questions.length }})</h2>
        @if (quiz()!.questions.length === 0) {
          <p class="quiz-editor__empty">No questions yet. Add your first question above.</p>
        }
        @for (q of quiz()!.questions; track q.id; let qi = $index) {
          <div class="quiz-editor__question-card">
            <div class="quiz-editor__question-header">
              <span class="quiz-editor__question-num">Q{{ qi + 1 }}</span>
              <span class="quiz-editor__question-type">{{ q.type }}</span>
              <span class="quiz-editor__question-points"
                >{{ q.points }} pt{{ q.points !== 1 ? 's' : '' }}</span
              >
              <p-button
                icon="pi pi-trash"
                severity="danger"
                size="small"
                [text]="true"
                (onClick)="removeQuestion(q.id)"
                aria-label="Remove question"
              />
            </div>
            <p class="quiz-editor__prompt">{{ q.prompt }}</p>

            <!-- Choice-type options -->
            @if (isChoiceType(q.type)) {
              <div class="quiz-editor__options">
                <strong>Options</strong>
                @for (opt of q.options; track opt.id; let oi = $index) {
                  <div class="quiz-editor__option-row">
                    <input
                      pInputText
                      type="text"
                      [placeholder]="'Option ' + (oi + 1)"
                      [(ngModel)]="opt.text"
                      [attr.aria-label]="'Option ' + (oi + 1) + ' text'"
                    />
                    <label class="quiz-editor__checkbox-label">
                      <p-checkbox
                        [(ngModel)]="opt.isCorrect"
                        [binary]="true"
                        [inputId]="'opt-correct-' + q.id + '-' + oi"
                      />
                      Correct
                    </label>
                    <p-button
                      icon="pi pi-times"
                      severity="danger"
                      size="small"
                      [text]="true"
                      (onClick)="removeOption(q, oi)"
                      aria-label="Remove option"
                    />
                  </div>
                }
                <p-button
                  label="Add Option"
                  severity="secondary"
                  size="small"
                  (onClick)="addOption(q)"
                />
              </div>
            }

            <!-- Ordering / matching / fill_in answer key -->
            @if (isAnswerKeyType(q.type)) {
              <div class="quiz-editor__answer-key">
                <strong>Answer Key</strong>
                @for (entry of q.answerKey; track $index; let ai = $index) {
                  <div class="quiz-editor__answer-key-row">
                    <input
                      pInputText
                      type="text"
                      [placeholder]="'Entry ' + (ai + 1)"
                      [ngModel]="entry"
                      (ngModelChange)="updateAnswerKey(q, ai, $event)"
                      [attr.aria-label]="'Answer key entry ' + (ai + 1)"
                    />
                    <p-button
                      icon="pi pi-times"
                      severity="danger"
                      size="small"
                      [text]="true"
                      (onClick)="removeAnswerKey(q, ai)"
                      aria-label="Remove answer key entry"
                    />
                  </div>
                }
                <p-button
                  label="Add Entry"
                  severity="secondary"
                  size="small"
                  (onClick)="addAnswerKey(q)"
                />
              </div>
            }
          </div>
        }

        <!-- Save All -->
        <div class="quiz-editor__save-row">
          <p-button label="Save Quiz" [loading]="saving()" (onClick)="saveQuiz()" />
          @if (saveError()) {
            <p class="quiz-editor__error">{{ saveError() }}</p>
          }
          @if (saveSuccess()) {
            <p class="quiz-editor__success">Quiz saved.</p>
          }
        </div>
      } @else {
        <p>Quiz not found.</p>
      }
    </section>
  `,
  styles: [
    `
      .quiz-editor {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .quiz-editor__nav {
        margin-bottom: 1rem;
      }
      .quiz-editor__nav a {
        color: inherit;
        text-decoration: underline;
      }
      .quiz-editor__settings,
      .quiz-editor__add-question {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
        margin-top: 1.5rem;
      }
      .quiz-editor__settings-row {
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem;
        align-items: flex-end;
        margin-bottom: 0.75rem;
      }
      .quiz-editor__add-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .quiz-editor__question-card {
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 1rem;
        background: var(--assurance-color-surface, #fff);
      }
      .quiz-editor__question-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .quiz-editor__question-num {
        font-weight: 700;
      }
      .quiz-editor__question-type {
        background: #e5e7eb;
        border-radius: 0.25rem;
        padding: 0.1rem 0.4rem;
        font-size: 0.75rem;
      }
      .quiz-editor__question-points {
        color: #6b7280;
        font-size: 0.875rem;
        margin-left: auto;
      }
      .quiz-editor__prompt {
        font-size: 1rem;
        margin-bottom: 0.75rem;
      }
      .quiz-editor__options,
      .quiz-editor__answer-key {
        margin-top: 0.5rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .quiz-editor__option-row,
      .quiz-editor__answer-key-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .quiz-editor__checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.875rem;
      }
      .quiz-editor__empty {
        color: #6b7280;
      }
      .quiz-editor__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .quiz-editor__success {
        color: #166534;
        margin-top: 0.5rem;
      }
      .quiz-editor__save-row {
        margin-top: 1.5rem;
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class QuizEditorComponent {
  /** Route param injected via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly quizRepo = inject(QuizRepository);
  private readonly tenantService = inject(TenantService);

  protected readonly quiz = signal<Quiz | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal(false);
  protected readonly savingSettings = signal(false);
  protected readonly saveSettingsError = signal<string | null>(null);

  protected readonly questionTypeOptions = QUESTION_TYPES.map((t) => ({ label: t, value: t }));

  protected newQuestionType: QuestionType | null = null;
  protected newQuestionPrompt = '';
  protected newQuestionPoints = 1;

  protected editPassThreshold = 70;
  protected editRandomize = false;

  constructor() {
    effect(() => {
      const qid = this.id();
      if (qid) {
        void this.loadQuiz(qid);
      }
    });
  }

  private async loadQuiz(quizId: string): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const q = await this.quizRepo.getById(tid, quizId);
      this.quiz.set(q);
      if (q) {
        this.editPassThreshold = q.passThreshold;
        this.editRandomize = q.randomize;
      }
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load quiz');
    } finally {
      this.loading.set(false);
    }
  }

  protected isChoiceType(type: QuestionType): boolean {
    return (CHOICE_TYPES as readonly string[]).includes(type);
  }

  protected isAnswerKeyType(type: QuestionType): boolean {
    return type === 'ordering' || type === 'matching' || type === 'fill_in';
  }

  protected addQuestion(): void {
    if (!this.newQuestionType || !this.newQuestionPrompt.trim()) return;
    const current = this.quiz();
    if (!current) return;
    const newQ: QuizQuestion = {
      id: crypto.randomUUID(),
      type: this.newQuestionType,
      prompt: this.newQuestionPrompt.trim(),
      points: this.newQuestionPoints ?? 1,
      options: [],
      answerKey: [],
    };
    this.quiz.set({ ...current, questions: [...current.questions, newQ] });
    this.newQuestionType = null;
    this.newQuestionPrompt = '';
    this.newQuestionPoints = 1;
  }

  protected removeQuestion(questionId: string): void {
    const current = this.quiz();
    if (!current) return;
    this.quiz.set({
      ...current,
      questions: current.questions.filter((q) => q.id !== questionId),
    });
  }

  protected addOption(question: QuizQuestion): void {
    const current = this.quiz();
    if (!current) return;
    const newOption = { id: crypto.randomUUID(), text: '', isCorrect: false };
    const updated = current.questions.map((q) =>
      q.id === question.id ? { ...q, options: [...q.options, newOption] } : q,
    );
    this.quiz.set({ ...current, questions: updated });
  }

  protected removeOption(question: QuizQuestion, optionIndex: number): void {
    const current = this.quiz();
    if (!current) return;
    const updated = current.questions.map((q) =>
      q.id === question.id ? { ...q, options: q.options.filter((_, i) => i !== optionIndex) } : q,
    );
    this.quiz.set({ ...current, questions: updated });
  }

  protected addAnswerKey(question: QuizQuestion): void {
    const current = this.quiz();
    if (!current) return;
    const updated = current.questions.map((q) =>
      q.id === question.id ? { ...q, answerKey: [...q.answerKey, ''] } : q,
    );
    this.quiz.set({ ...current, questions: updated });
  }

  protected removeAnswerKey(question: QuizQuestion, index: number): void {
    const current = this.quiz();
    if (!current) return;
    const updated = current.questions.map((q) =>
      q.id === question.id ? { ...q, answerKey: q.answerKey.filter((_, i) => i !== index) } : q,
    );
    this.quiz.set({ ...current, questions: updated });
  }

  protected updateAnswerKey(question: QuizQuestion, index: number, value: string): void {
    const current = this.quiz();
    if (!current) return;
    const updated = current.questions.map((q) => {
      if (q.id !== question.id) return q;
      const newKey = [...q.answerKey];
      newKey[index] = value;
      return { ...q, answerKey: newKey };
    });
    this.quiz.set({ ...current, questions: updated });
  }

  protected async saveSettings(): Promise<void> {
    const tid = this.tenantService.tenantId();
    const current = this.quiz();
    if (!tid || !current) return;
    this.savingSettings.set(true);
    this.saveSettingsError.set(null);
    try {
      const updated: Quiz = {
        ...current,
        passThreshold: this.editPassThreshold,
        randomize: this.editRandomize,
      };
      await this.quizRepo.set(tid, updated);
      this.quiz.set(updated);
    } catch (err) {
      this.saveSettingsError.set((err as Error).message ?? 'Failed to save settings');
    } finally {
      this.savingSettings.set(false);
    }
  }

  protected async saveQuiz(): Promise<void> {
    const tid = this.tenantService.tenantId();
    const current = this.quiz();
    if (!tid || !current) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    try {
      await this.quizRepo.set(tid, current);
      this.saveSuccess.set(true);
    } catch (err) {
      this.saveError.set((err as Error).message ?? 'Failed to save quiz');
    } finally {
      this.saving.set(false);
    }
  }
}
