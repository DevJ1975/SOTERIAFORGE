import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoachDiagramComponent } from './coach-diagram.component';
import { TutorService, type TutorMessage } from './tutor.service';
import {
  CoachApi,
  coachError,
  type CoachAgentId,
  type CoachCourse,
  type CoachProfile,
} from './coach-api';

/**
 * TutorChatComponent — full-page chat UI for the RAG AI tutor.
 *
 * Django derives identity and tenant from authentication, never the chat body.
 * Each mounted chat owns transient history, cleared when its context changes.
 * Answers stream in as they are written and are always rendered as plain text.
 */
@Component({
  selector: 'assurance-tutor-chat',
  standalone: true,
  imports: [FormsModule, CoachDiagramComponent],
  providers: [TutorService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .tutor-chat {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: inherit;
      }

      .tutor-chat__messages {
        flex: 1;
        overflow-y: auto;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .tutor-chat__message {
        max-width: 75%;
        padding: 0.75rem 1rem;
        border-radius: 0.75rem;
        line-height: 1.5;
        word-break: break-word;
      }

      .tutor-chat__message--user {
        align-self: flex-end;
        background: var(--assurance-color-primary, #4f46e5);
        color: #fff;
      }

      .tutor-chat__message--assistant {
        align-self: flex-start;
        background: var(--surface-100, #f3f4f6);
        color: var(--text-color, #111827);
      }

      .tutor-chat__citations {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
        margin: 0.25rem 0 0;
        padding: 0;
        list-style: none;
      }

      .tutor-chat__citation-chip {
        font-size: 0.75rem;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        background: var(--assurance-color-primary, #4f46e5);
        color: #fff;
        opacity: 0.85;
      }

      .tutor-chat__message--streaming {
        opacity: 0.85;
      }

      .tutor-chat__text {
        white-space: pre-wrap;
      }

      .tutor-chat__sources-label {
        font-size: 0.75rem;
        font-weight: 600;
        margin: 0.5rem 0 0;
      }

      .tutor-chat__tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.375rem;
        margin-top: 0.5rem;
      }

      .tutor-chat__thumb,
      .tutor-chat__followup,
      .tutor-chat__note-send {
        min-height: 44px;
        padding: 0 0.75rem;
        border: 1px solid var(--surface-300, #d1d5db);
        border-radius: 0.5rem;
        background: #fff;
        color: var(--text-color, #111827);
        font: inherit;
        font-size: 0.875rem;
        cursor: pointer;
      }

      .tutor-chat__thumb[aria-pressed='true'] {
        border-color: var(--text-color, #111827);
        border-width: 2px;
        font-weight: 700;
      }

      .tutor-chat__followups {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.375rem;
        margin: 0.5rem 0 0;
        padding: 0;
        list-style: none;
      }

      .tutor-chat__followup {
        text-align: left;
        min-height: 44px;
        height: auto;
        padding: 0.5rem 0.75rem;
      }

      .tutor-chat__note {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
        align-items: flex-end;
        margin-top: 0.5rem;
        font-size: 0.875rem;
      }

      .tutor-chat__note input {
        display: block;
        min-height: 44px;
        min-width: 14rem;
        padding: 0 0.5rem;
        border: 1px solid var(--surface-300, #d1d5db);
        border-radius: 0.5rem;
        font: inherit;
      }

      .tutor-chat__sr {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      .tutor-chat__error {
        padding: 0.5rem 1rem;
        color: var(--red-600, #dc2626);
        font-size: 0.875rem;
      }

      .tutor-chat__pending {
        padding: 0.5rem 1rem;
        color: var(--text-color-secondary, #6b7280);
        font-size: 0.875rem;
        font-style: italic;
      }

      .tutor-chat__input-row {
        display: flex;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--surface-200, #e5e7eb);
      }

      .tutor-chat__input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--surface-300, #d1d5db);
        border-radius: 0.5rem;
        font-size: 1rem;
        outline: none;
      }

      .tutor-chat__input:focus {
        border-color: var(--assurance-color-primary, #4f46e5);
      }

      .tutor-chat__send-btn {
        padding: 0.5rem 1.25rem;
        border: none;
        border-radius: 0.5rem;
        background: var(--assurance-color-primary, #4f46e5);
        color: #fff;
        font-size: 1rem;
        cursor: pointer;
        transition: opacity 0.15s;
      }

      .tutor-chat__send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
  template: `
    <div class="tutor-chat">
      <label>
        Agent
        <select
          aria-label="Tutor agent"
          [ngModel]="selectedAgent()"
          (ngModelChange)="selectedAgent.set($event)"
        >
          <option value="general">Course Tutor</option>
          @for (profile of profiles(); track profile.id) {
            @if (profile.id !== 'general') {
              <option [value]="profile.id">{{ profile.title }}</option>
            }
          }
        </select>
      </label>
      @if (profileError()) {
        <p role="alert">{{ profileError() }}</p>
      }
      @if (!courseId()) {
        <label>
          Course
          <select
            aria-label="Tutor course"
            [ngModel]="selectedCourse()"
            (ngModelChange)="selectedCourse.set($event)"
          >
            <option value="">Select an enrolled course</option>
            @for (course of courses(); track course.id) {
              <option [value]="course.id">{{ course.title }}</option>
            }
          </select>
        </label>
        @if (courseError()) {
          <p role="alert">{{ courseError() }}</p>
        }
      }
      <p>Answers use approved course sources. No chat history is saved to the server.</p>
      @if (selectedAgent() !== 'general') {
        <p>
          Specialist study support, not an autonomous agent. Only approved sources for this agent
          and course are used.
        </p>
      }
      <div class="tutor-chat__messages">
        @for (msg of tutorService.messages(); track msg.id) {
          <div
            class="tutor-chat__message"
            [class.tutor-chat__message--user]="msg.role === 'user'"
            [class.tutor-chat__message--assistant]="msg.role === 'assistant'"
            [class.tutor-chat__message--streaming]="msg.streaming"
          >
            <span class="tutor-chat__text">{{ msg.content }}</span>

            @if (msg.role === 'assistant' && !msg.streaming) {
              @if (msg.diagram; as diagram) {
                <assurance-coach-diagram [diagram]="diagram" />
              }

              @if (msg.citations.length > 0) {
                <p class="tutor-chat__sources-label" [id]="'src-' + msg.id">Sources</p>
                <ul class="tutor-chat__citations" [attr.aria-labelledby]="'src-' + msg.id">
                  @for (citation of msg.citations; track $index) {
                    <li class="tutor-chat__citation-chip">
                      {{ citation.label ?? citation.sourceId }}
                    </li>
                  }
                </ul>
              }

              @if (msg.exchangeId) {
                <div class="tutor-chat__tools" role="group" aria-label="Rate this answer">
                  <button
                    type="button"
                    class="tutor-chat__thumb"
                    [attr.aria-pressed]="msg.rating === 'up'"
                    (click)="rate(msg, 'up')"
                  >
                    <span aria-hidden="true">👍</span> Helpful
                  </button>
                  <button
                    type="button"
                    class="tutor-chat__thumb"
                    [attr.aria-pressed]="msg.rating === 'down'"
                    (click)="rate(msg, 'down')"
                  >
                    <span aria-hidden="true">👎</span> Not helpful
                  </button>
                </div>
                @if (msg.rating === 'down' && noteFor() === msg.id) {
                  <div class="tutor-chat__note">
                    <label>
                      What was wrong? (optional)
                      <input
                        type="text"
                        maxlength="500"
                        aria-label="What was wrong with this answer? Optional"
                        [ngModel]="noteText()"
                        (ngModelChange)="noteText.set($event)"
                        (keydown.enter)="sendNote(msg)"
                      />
                    </label>
                    <button
                      type="button"
                      class="tutor-chat__note-send"
                      [disabled]="!noteText().trim()"
                      (click)="sendNote(msg)"
                    >
                      Send note
                    </button>
                  </div>
                }
                @if (noteSent() === msg.id) {
                  <p class="tutor-chat__pending" role="status">
                    Thanks. Your instructor will see this.
                  </p>
                }
              }

              @if (msg.followUps?.length) {
                <p class="tutor-chat__sources-label" [id]="'fu-' + msg.id">Ask next</p>
                <ul class="tutor-chat__followups" [attr.aria-labelledby]="'fu-' + msg.id">
                  @for (followUp of msg.followUps; track $index) {
                    <li>
                      <button
                        type="button"
                        class="tutor-chat__followup"
                        [disabled]="tutorService.pending()"
                        (click)="ask(followUp)"
                      >
                        {{ followUp }}
                      </button>
                    </li>
                  }
                </ul>
              }
            }
          </div>
        }

        @if (tutorService.pending()) {
          <div class="tutor-chat__pending">
            {{ tutorService.stage() === 'generating' ? 'Writing an answer…' : 'Finding sources…' }}
          </div>
        }

        @if (tutorService.error()) {
          <div class="tutor-chat__error" role="alert">{{ tutorService.error() }}</div>
        }
      </div>
      <!-- One announcement when an answer starts and one when it is complete, never per token. -->
      <p class="tutor-chat__sr" role="status" aria-live="polite">
        {{ tutorService.announcement() }}
      </p>

      <div class="tutor-chat__input-row">
        <input
          class="tutor-chat__input"
          type="text"
          placeholder="Ask a question…"
          aria-label="Ask the course tutor"
          maxlength="1000"
          [(ngModel)]="questionText"
          (keydown.enter)="send()"
          [disabled]="tutorService.pending() || !activeCourse()"
        />
        <button
          class="tutor-chat__send-btn"
          (click)="send()"
          [disabled]="tutorService.pending() || !questionText().trim() || !activeCourse()"
        >
          Send
        </button>
      </div>
    </div>
  `,
})
export class TutorChatComponent {
  readonly tenantId = input.required<string>();
  readonly uid = input.required<string>();
  readonly courseId = input('');
  /** Narrows answers to this module's sources (plus course-wide ones) when set. */
  readonly moduleId = input('');
  private readonly api = inject(CoachApi);
  protected readonly courses = signal<CoachCourse[]>([]);
  protected readonly selectedCourse = signal('');
  protected readonly courseError = signal<string | null>(null);
  protected readonly profiles = signal<CoachProfile[]>([]);
  protected readonly selectedAgent = signal<CoachAgentId>('general');
  protected readonly profileError = signal<string | null>(null);

  protected readonly tutorService = inject(TutorService);

  protected readonly questionText = signal('');
  /** The answer whose "what was wrong" note is open, and the note being typed. */
  protected readonly noteFor = signal('');
  protected readonly noteText = signal('');
  protected readonly noteSent = signal('');

  protected activeCourse(): string {
    return this.courseId() || this.selectedCourse();
  }

  constructor() {
    effect((onCleanup) => {
      this.tenantId();
      this.uid();
      const courseId = this.courseId();
      this.courses.set([]);
      this.selectedCourse.set('');
      this.courseError.set(null);
      this.profiles.set([]);
      this.selectedAgent.set('general');
      this.profileError.set(null);
      let active = true;
      onCleanup(() => {
        active = false;
      });
      void this.api
        .profiles()
        .then((profiles) => {
          if (active) this.profiles.set(profiles);
        })
        .catch((error: unknown) => {
          if (active) this.profileError.set(coachError(error));
        });
      if (!courseId) {
        void this.api
          .courses()
          .then((courses) => {
            if (active) this.courses.set(courses);
          })
          .catch((error: unknown) => {
            if (active) this.courseError.set(coachError(error));
          });
      }
    });
    effect(() => {
      this.tenantId();
      this.uid();
      this.activeCourse();
      this.selectedAgent();
      this.tutorService.reset();
      this.questionText.set('');
      this.noteFor.set('');
      this.noteText.set('');
      this.noteSent.set('');
    });
  }

  protected send(): void {
    const question = this.questionText().trim();
    if (!question) return;
    this.questionText.set('');
    this.ask(question);
  }

  /** Asks a typed question or a suggested follow-up. */
  protected ask(question: string): void {
    if (!question || !this.activeCourse() || this.tutorService.pending()) return;
    void this.tutorService.ask(question, {
      tenantId: this.tenantId(),
      uid: this.uid(),
      courseId: this.activeCourse(),
      agent: this.selectedAgent(),
      ...(this.moduleId() ? { moduleId: this.moduleId() } : {}),
    });
  }

  protected rate(message: TutorMessage, rating: 'up' | 'down'): void {
    const turningOn = message.rating !== rating;
    this.noteSent.set('');
    this.noteText.set('');
    this.noteFor.set(rating === 'down' && turningOn ? message.id : '');
    void this.tutorService.rate(message.id, rating);
  }

  protected sendNote(message: TutorMessage): void {
    const note = this.noteText().trim();
    if (!note) return;
    this.noteFor.set('');
    this.noteText.set('');
    this.noteSent.set(message.id);
    void this.tutorService.rate(message.id, 'down', note);
  }
}
