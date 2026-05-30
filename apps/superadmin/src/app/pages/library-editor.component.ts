import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { LibraryRepository } from '@assurance/data-access';
import { CONTENT_TYPES } from '@assurance/shared';
import type { Course, Module } from '@assurance/shared';

interface ContentTypeOption {
  label: string;
  value: string;
}

@Component({
  selector: 'assurance-superadmin-library-editor',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, SelectModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="library-editor">
      @if (loading() && !course()) {
        <p>Loading course…</p>
      } @else if (loadError()) {
        <p class="library-editor__error">{{ loadError() }}</p>
      } @else if (course()) {
        <h1>{{ course()!.title }}</h1>
        <p class="library-editor__description">{{ course()!.description }}</p>

        <!-- Add Module Form -->
        <p-card header="Add Module" styleClass="library-editor__form-card">
          <div class="library-editor__form">
            <input
              pInputText
              type="text"
              placeholder="Module title"
              [(ngModel)]="newModuleTitle"
              class="library-editor__field--wide"
            />
            <p-select
              [options]="contentTypeOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Content type"
              [(ngModel)]="newContentType"
            />
            <input
              pInputText
              type="text"
              placeholder="External URL (optional)"
              [(ngModel)]="newExternalUrl"
              class="library-editor__field--wide"
            />
            <input
              pInputText
              type="text"
              placeholder="Asset reference (optional)"
              [(ngModel)]="newAssetRef"
            />
            <p-button
              label="Add Module"
              [loading]="saving()"
              [disabled]="!newModuleTitle || !newContentType"
              (onClick)="addModule()"
            />
          </div>
          @if (saveError()) {
            <p class="library-editor__error">{{ saveError() }}</p>
          }
        </p-card>

        <!-- Modules Table -->
        @if (modules().length === 0 && !loading()) {
          <p>No modules yet. Add the first module above.</p>
        } @else {
          <p-table
            [value]="modules()"
            [tableStyle]="{ 'min-width': '40rem' }"
            styleClass="library-editor__table"
          >
            <ng-template pTemplate="header">
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Type</th>
                <th>URL / Asset</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-m>
              <tr>
                <td>{{ m.order + 1 }}</td>
                <td>{{ m.title }}</td>
                <td>{{ m.contentType }}</td>
                <td>{{ m.externalUrl ?? m.assetRef ?? '—' }}</td>
              </tr>
            </ng-template>
          </p-table>
        }
      }
    </section>
  `,
  styles: [
    `
      .library-editor {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .library-editor__description {
        color: #6b7280;
        margin: 0;
      }
      .library-editor__form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-start;
      }
      .library-editor__field--wide {
        width: 100%;
        min-width: 20rem;
      }
      .library-editor__error {
        color: #b00020;
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class LibraryEditorComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly libraryRepo = inject(LibraryRepository);

  protected readonly course = signal<Course | null>(null);
  protected readonly modules = signal<Module[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected newModuleTitle = '';
  protected newContentType = '';
  protected newExternalUrl = '';
  protected newAssetRef = '';

  protected readonly contentTypeOptions: ContentTypeOption[] = CONTENT_TYPES.map((ct) => ({
    label: ct.charAt(0).toUpperCase() + ct.slice(1),
    value: ct,
  }));

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [c, mods] = await Promise.all([
        this.libraryRepo.getCourse(this.id()),
        this.libraryRepo.listModules(this.id()),
      ]);
      this.course.set(c ?? null);
      this.modules.set(mods);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load course');
    } finally {
      this.loading.set(false);
    }
  }

  protected async addModule(): Promise<void> {
    if (!this.newModuleTitle || !this.newContentType) return;
    const courseId = this.id();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const m: Module = {
        id,
        courseId,
        tenantId: this.course()!.tenantId,
        title: this.newModuleTitle,
        order: this.modules().length,
        contentType: this.newContentType as Module['contentType'],
        ...(this.newExternalUrl ? { externalUrl: this.newExternalUrl } : {}),
        ...(this.newAssetRef ? { assetRef: this.newAssetRef } : {}),
        xpReward: 0,
        badgeRefs: [],
        completion: {},
        createdAt: now,
      };
      await this.libraryRepo.setModule(courseId, m);
      this.newModuleTitle = '';
      this.newContentType = '';
      this.newExternalUrl = '';
      this.newAssetRef = '';
      const updated = await this.libraryRepo.listModules(courseId);
      this.modules.set(updated);
    } catch (err) {
      this.saveError.set((err as Error).message ?? 'Failed to add module');
    } finally {
      this.saving.set(false);
    }
  }
}
