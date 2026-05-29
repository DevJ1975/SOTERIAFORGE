import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TutorService } from './tutor.service';

/**
 * TutorChatComponent — full-page chat UI for the RAG AI tutor.
 *
 * Tenant isolation: `tenantId` is passed to TutorService.ask() and forwarded to
 * the `askTutor` Firebase callable. However, tenant isolation is AUTHORITATIVE
 * server-side — the callable verifies the caller's auth claim tenantId and uses
 * it for all vector retrieval filtering. The client-supplied tenantId is a
 * convenience hint only; the server never trusts it for security decisions.
 */
@Component({
  selector: 'forge-tutor-chat',
  standalone: true,
  imports: [FormsModule],
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
        background: var(--forge-color-primary, #4f46e5);
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
        background: var(--forge-color-primary, #4f46e5);
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
        border-color: var(--forge-color-primary, #4f46e5);
      }

      .tutor-chat__send-btn {
        padding: 0.5rem 1.25rem;
        border: none;
        border-radius: 0.5rem;
        background: var(--forge-color-primary, #4f46e5);
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
                @for (citation of msg.citations; track citation.sourceId) {
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
          <div class="tutor-chat__error">{{ tutorService.error() }}</div>
        }
      </div>

      <div class="tutor-chat__input-row">
        <input
          class="tutor-chat__input"
          type="text"
          placeholder="Ask a question…"
          [(ngModel)]="questionText"
          (keydown.enter)="send()"
          [disabled]="tutorService.pending()"
        />
        <button
          class="tutor-chat__send-btn"
          (click)="send()"
          [disabled]="tutorService.pending() || !questionText().trim()"
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

  protected readonly tutorService = inject(TutorService);

  protected readonly questionText = signal('');

  protected send(): void {
    const question = this.questionText().trim();
    if (!question || this.tutorService.pending()) return;
    this.questionText.set('');
    void this.tutorService.ask(question, {
      tenantId: this.tenantId(),
      uid: this.uid(),
    });
  }
}
