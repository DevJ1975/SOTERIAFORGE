import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TutorService } from './tutor.service';
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
 */
@Component({
  selector: 'assurance-tutor-chat',
  standalone: true,
  imports: [FormsModule],
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
        margin-top: 0.5rem;
      }

      .tutor-chat__citation-chip {
        font-size: 0.75rem;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        background: var(--assurance-color-primary, #4f46e5);
        color: #fff;
        opacity: 0.85;
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
          >
            <span>{{ msg.content }}</span>

            @if (msg.role === 'assistant' && msg.citations.length > 0) {
              <div class="tutor-chat__citations">
                @for (citation of msg.citations; track $index) {
                  <span class="tutor-chat__citation-chip">
                    {{ citation.label ?? citation.sourceId }}
                  </span>
                }
              </div>
            }
          </div>
        }

        @if (tutorService.pending()) {
          <div class="tutor-chat__pending">Thinking…</div>
        }

        @if (tutorService.error()) {
          <div class="tutor-chat__error" role="alert">{{ tutorService.error() }}</div>
        }
      </div>

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
  private readonly api = inject(CoachApi);
  protected readonly courses = signal<CoachCourse[]>([]);
  protected readonly selectedCourse = signal('');
  protected readonly courseError = signal<string | null>(null);
  protected readonly profiles = signal<CoachProfile[]>([]);
  protected readonly selectedAgent = signal<CoachAgentId>('general');
  protected readonly profileError = signal<string | null>(null);

  protected readonly tutorService = inject(TutorService);

  protected readonly questionText = signal('');

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
    });
  }

  protected send(): void {
    const question = this.questionText().trim();
    if (!question || !this.activeCourse() || this.tutorService.pending()) return;
    this.questionText.set('');
    void this.tutorService.ask(question, {
      tenantId: this.tenantId(),
      uid: this.uid(),
      courseId: this.activeCourse(),
      agent: this.selectedAgent(),
    });
  }
}
