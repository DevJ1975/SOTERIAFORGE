import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { KnowledgeRepository } from '@forge/data-access';
import { TenantService } from '@forge/auth';
import { IngestService } from '@forge/ai-tutor';
import type { KnowledgeSource } from '@forge/shared';

type KnowledgeKind = 'upload' | 'url';

const KIND_OPTIONS: Array<{ label: string; value: KnowledgeKind }> = [
  { label: 'Pasted text', value: 'upload' },
  { label: 'URL', value: 'url' },
];

@Component({
  selector: 'forge-admin-knowledge',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, SelectModule, TextareaModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="knowledge">
      <h1>AI Knowledge Base</h1>

      <!-- Add Source Form -->
      <div class="knowledge__form-card">
        <h2>Add Source</h2>
        <div class="knowledge__form-fields">
          <input
            pInputText
            type="text"
            placeholder="Source title"
            [(ngModel)]="newTitle"
            aria-label="Source title"
          />
          <p-select
            [options]="kindOptions"
            [(ngModel)]="newKind"
            placeholder="Kind"
            aria-label="Kind"
          />
          @if (newKind === 'url') {
            <input
              pInputText
              type="url"
              placeholder="Source URL"
              [(ngModel)]="newSourceRef"
              aria-label="Source URL"
            />
          }
        </div>
        <textarea
          pTextarea
          rows="6"
          placeholder="Paste source text here…"
          [(ngModel)]="newText"
          aria-label="Source text"
          class="knowledge__textarea"
        ></textarea>
        <div class="knowledge__form-actions">
          <p-button
            label="Add &amp; Ingest"
            [loading]="submitting()"
            [disabled]="!newTitle.trim() || !newText.trim()"
            (onClick)="addSource()"
          />
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
              <th>Kind</th>
              <th>Status</th>
              <th>Chunks</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-s>
            <tr>
              <td>{{ s.title }}</td>
              <td>{{ s.kind }}</td>
              <td>{{ s.status }}</td>
              <td>{{ s.chunkCount }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4">No knowledge sources yet. Add your first source above.</td>
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
        background: var(--forge-color-surface, #fff);
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
export class KnowledgeComponent implements OnInit {
  private readonly knowledgeRepo = inject(KnowledgeRepository);
  private readonly tenantService = inject(TenantService);
  private readonly ingestService = inject(IngestService);

  protected readonly kindOptions = KIND_OPTIONS;

  protected readonly sources = signal<KnowledgeSource[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly ingestResult = signal<{ ok: boolean; chunks: number } | null>(null);

  protected newTitle = '';
  protected newKind: KnowledgeKind = 'upload';
  protected newSourceRef = '';
  protected newText = '';

  ngOnInit(): void {
    void this.loadSources();
  }

  private async loadSources(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.knowledgeRepo.list(tid);
      this.sources.set(list);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load knowledge sources');
    } finally {
      this.loading.set(false);
    }
  }

  protected async addSource(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid || !this.newTitle.trim() || !this.newText.trim()) return;

    this.submitting.set(true);
    this.submitError.set(null);
    this.ingestResult.set(null);

    try {
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      const source: KnowledgeSource = {
        id,
        tenantId: tid,
        title: this.newTitle.trim(),
        kind: this.newKind,
        sourceRef:
          this.newKind === 'url' && this.newSourceRef.trim() ? this.newSourceRef.trim() : undefined,
        status: 'pending',
        chunkCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      await this.knowledgeRepo.set(tid, source);

      const result = await this.ingestService.ingest({
        tenantId: tid,
        sourceId: id,
        text: this.newText.trim(),
        label: this.newTitle.trim(),
      });

      this.ingestResult.set(result);
      this.newTitle = '';
      this.newKind = 'upload';
      this.newSourceRef = '';
      this.newText = '';

      await this.loadSources();
    } catch (err) {
      this.submitError.set((err as Error).message ?? 'Failed to add source');
    } finally {
      this.submitting.set(false);
    }
  }
}
