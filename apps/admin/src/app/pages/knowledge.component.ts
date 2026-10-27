import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { TenantService } from '@assurance/auth';
import {
  CoachApi,
  IngestService,
  coachError,
  type CoachCourse,
  type CoachSource,
  type CoachAgentId,
  type CoachProfile,
  type CoachReference,
} from '@assurance/ai-tutor';

@Component({
  selector: 'assurance-admin-knowledge',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, TextareaModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="knowledge">
      <h1>AI Knowledge Base</h1>

      <!-- Add Source Form -->
      <div class="knowledge__form-card">
        <h2>{{ editingId ? 'Replace Source' : 'Add Source' }}</h2>
        <p>
          Approve only learner-facing material, never assessment answer keys. Sources are
          course-specific. URLs are not fetched.
        </p>
        <div class="knowledge__form-fields">
          <input
            pInputText
            type="text"
            placeholder="Source title"
            [(ngModel)]="newTitle"
            aria-label="Source title"
          />
          <select aria-label="Source course" [(ngModel)]="courseId" [disabled]="!!editingId">
            <option value="">Select a published course</option>
            @for (course of courses(); track course.id) {
              <option [value]="course.id">{{ course.title }}</option>
            }
          </select>
          <select aria-label="Source agent" [(ngModel)]="agent" [disabled]="!!editingId">
            <option value="general">Course Tutor</option>
            @for (profile of profiles(); track profile.id) {
              @if (profile.id !== 'general') {
                <option [value]="profile.id">{{ profile.title }}</option>
              }
            }
          </select>
        </div>
        <label
          >Official source URL
          <input
            pInputText
            type="url"
            aria-label="Source reference URL"
            [(ngModel)]="referenceUrl"
            maxlength="2048"
          />
        </label>
        <label
          >Reviewed edition / publication or retrieval date
          <input
            pInputText
            type="text"
            aria-label="Source edition"
            [(ngModel)]="edition"
            maxlength="200"
          />
        </label>
        @if (agent !== 'general') {
          <p>Specialist sources require an HTTPS reference URL and a reviewed edition/date.</p>
        }
        <textarea
          pTextarea
          rows="6"
          placeholder="Paste source text here…"
          [(ngModel)]="newText"
          aria-label="Source text"
          class="knowledge__textarea"
          maxlength="60000"
          [disabled]="!!selectedFile"
        ></textarea>
        <label
          >Or upload text, Markdown or a text PDF (2 MB, 40 pages maximum)
          <input #fileInput type="file" accept=".txt,.md,.pdf" (change)="chooseFile($event)" />
        </label>
        <label
          ><input type="checkbox" [(ngModel)]="approved" /> I approve this material for learners in
          this course.</label
        >
        <div class="knowledge__form-actions">
          <p-button
            label="Add &amp; Ingest"
            [loading]="submitting()"
            [disabled]="
              submitting() ||
              !courseId ||
              !approved ||
              (agent !== 'general' && (!referenceUrl.startsWith('https://') || !edition.trim())) ||
              !newTitle.trim() ||
              (!newText.trim() && !selectedFile)
            "
            (onClick)="addSource(fileInput)"
          />
          @if (editingId) {
            <button type="button" (click)="clearForm(); fileInput.value = ''">
              Cancel replacement
            </button>
          }
        </div>
        @if (submitError()) {
          <p class="knowledge__error">{{ submitError() }}</p>
        }
        @if (ingestResult()) {
          <p class="knowledge__success">
            Ingested successfully — {{ ingestResult()!.chunks }} chunks created.
          </p>
        }
      </div>

      <section aria-label="Public framework candidates">
        <h2>Public framework candidates — pending instructor review</h2>
        <p>
          Links and metadata only, not approved knowledge. Review the current official document,
          select a course, and upload or paste the material you approve. These references are not
          automatically fetched or ingested.
        </p>
        @for (profile of profiles(); track profile.id) {
          @if (profile.references.length) {
            <h3>{{ profile.title }}</h3>
            <ul>
              @for (reference of profile.references; track reference.id) {
                <li>
                  <a [href]="reference.url" target="_blank" rel="noopener noreferrer">{{
                    reference.title
                  }}</a>
                  — {{ reference.edition }} (link checked {{ reference.checkedOn }}, pending review)
                  <button
                    type="button"
                    [disabled]="submitting()"
                    (click)="useCandidate(profile, reference); fileInput.value = ''"
                  >
                    Prepare for review
                  </button>
                </li>
              }
            </ul>
          }
        }
      </section>

      <!-- Sources Table -->
      @if (loading()) {
        <p>Loading knowledge sources…</p>
      } @else if (loadError()) {
        <p class="knowledge__error">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="sources()"
          [paginator]="sources().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th>
              <th>Course</th>
              <th>Agent</th>
              <th>Chunks</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-s>
            <tr>
              <td>{{ s.title }}</td>
              <td>{{ courseTitle(s.courseId) }}</td>
              <td>{{ agentTitle(s.agent) }}</td>
              <td>{{ s.chunkCount }}</td>
              <td>
                <button
                  type="button"
                  [disabled]="submitting()"
                  (click)="editSource(s); fileInput.value = ''"
                >
                  Replace
                </button>
                <button type="button" [disabled]="submitting()" (click)="removeSource(s)">
                  Delete
                </button>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">No knowledge sources yet. Add your first source above.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .knowledge {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .knowledge__form-card {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .knowledge__form-fields {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
      }
      .knowledge__textarea {
        width: 100%;
        resize: vertical;
        font-family: inherit;
        font-size: 0.875rem;
      }
      .knowledge__form-actions {
        display: flex;
        gap: 0.75rem;
      }
      .knowledge__error {
        color: #b00020;
        margin-top: 0.25rem;
      }
      .knowledge__success {
        color: #166534;
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class KnowledgeComponent {
  private readonly api = inject(CoachApi);
  private readonly tenantService = inject(TenantService);
  private readonly ingestService = inject(IngestService);

  protected readonly sources = signal<CoachSource[]>([]);
  protected readonly courses = signal<CoachCourse[]>([]);
  protected readonly profiles = signal<CoachProfile[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly ingestResult = signal<{ ok: boolean; chunks: number } | null>(null);

  protected newTitle = '';
  protected newText = '';
  protected courseId = '';
  protected approved = false;
  protected selectedFile: File | undefined;
  protected editingId = '';
  protected agent: CoachAgentId = 'general';
  protected referenceUrl = '';
  protected edition = '';
  private context = 0;

  constructor() {
    effect(() => {
      const tid = this.tenantService.tenantId();
      const context = ++this.context;
      this.sources.set([]);
      this.courses.set([]);
      this.profiles.set([]);
      this.submitting.set(false);
      this.clearForm();
      if (tid) void this.loadSources(context);
      else this.loadError.set('Select a tenant to manage course sources.');
    });
  }

  private async loadSources(context = this.context): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [sources, courses, profiles] = await Promise.all([
        this.api.sources(),
        this.api.courses(),
        this.api.profiles(),
      ]);
      if (context !== this.context) return;
      this.sources.set(sources);
      this.courses.set(courses);
      this.profiles.set(profiles);
    } catch (err) {
      if (context === this.context) this.loadError.set(coachError(err));
    } finally {
      if (context === this.context) this.loading.set(false);
    }
  }

  protected courseTitle(id: string): string {
    return this.courses().find((course) => course.id === id)?.title ?? id;
  }

  protected agentTitle(id: CoachAgentId): string {
    return this.profiles().find((profile) => profile.id === id)?.title ?? id;
  }

  protected useCandidate(profile: CoachProfile, reference: CoachReference): void {
    this.clearForm();
    this.agent = profile.id;
    this.newTitle = reference.title;
    this.referenceUrl = reference.url;
    this.edition = reference.edition;
  }

  protected chooseFile(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.selectedFile = event.target.files?.[0];
  }

  protected clearForm(): void {
    this.newTitle = '';
    this.newText = '';
    this.courseId = '';
    this.approved = false;
    this.selectedFile = undefined;
    this.editingId = '';
    this.agent = 'general';
    this.referenceUrl = '';
    this.edition = '';
    this.submitError.set(null);
    this.ingestResult.set(null);
  }

  protected editSource(source: CoachSource): void {
    this.clearForm();
    this.editingId = source.id;
    this.newTitle = source.title;
    this.courseId = source.courseId;
    this.agent = source.agent;
    this.referenceUrl = source.referenceUrl;
    this.edition = source.edition;
  }

  protected async removeSource(source: CoachSource): Promise<void> {
    const context = this.context;
    this.submitting.set(true);
    this.submitError.set(null);
    try {
      await this.api.remove(source.id);
      if (context !== this.context) return;
      this.clearForm();
      await this.loadSources(context);
    } catch (error) {
      if (context === this.context) this.submitError.set(coachError(error));
    } finally {
      if (context === this.context) this.submitting.set(false);
    }
  }

  protected async addSource(fileInput?: HTMLInputElement): Promise<void> {
    if (
      this.submitting() ||
      !this.courseId ||
      !this.approved ||
      !this.newTitle.trim() ||
      (!this.newText.trim() && !this.selectedFile)
    )
      return;
    const context = this.context;

    this.submitting.set(true);
    this.submitError.set(null);
    this.ingestResult.set(null);

    try {
      const result = await this.ingestService.ingest({
        sourceId: this.editingId || crypto.randomUUID(),
        courseId: this.courseId,
        ...(this.selectedFile ? { file: this.selectedFile } : { text: this.newText.trim() }),
        label: this.newTitle.trim(),
        approved: this.approved,
        agent: this.agent,
        referenceUrl: this.referenceUrl.trim(),
        edition: this.edition.trim(),
      });

      if (context !== this.context) return;
      this.clearForm();
      if (fileInput) fileInput.value = '';
      this.ingestResult.set(result);
      await this.loadSources(context);
    } catch (err) {
      if (context === this.context) this.submitError.set(coachError(err));
    } finally {
      if (context === this.context) this.submitting.set(false);
    }
  }
}
