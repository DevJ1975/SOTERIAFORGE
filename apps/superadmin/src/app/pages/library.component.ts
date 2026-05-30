import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { LibraryRepository, LIBRARY_TENANT, TenantRepository } from '@assurance/data-access';
import { LibraryService } from '../services/library.service';
import type { Course, Tenant } from '@assurance/shared';

@Component({
  selector: 'assurance-superadmin-library',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    CardModule,
    InputTextModule,
    TableModule,
    TextareaModule,
    CheckboxModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="library">
      <h1>Global Course Library</h1>

      <!-- New Course Form -->
      <p-card header="New Course" styleClass="library__form-card">
        <div class="library__form">
          <input
            pInputText
            type="text"
            placeholder="Course title"
            [(ngModel)]="newTitle"
            class="library__field--wide"
          />
          <textarea
            pTextarea
            placeholder="Description (optional)"
            rows="3"
            [(ngModel)]="newDescription"
            class="library__field--wide"
          ></textarea>
          <p-button
            label="New Course"
            [loading]="loading()"
            [disabled]="!newTitle"
            (onClick)="createCourse()"
          />
        </div>
        @if (createError()) {
          <p class="library__error">{{ createError() }}</p>
        }
      </p-card>

      <!-- Courses Table -->
      @if (loading() && courses().length === 0) {
        <p>Loading courses…</p>
      } @else {
        <p-table
          [value]="courses()"
          [tableStyle]="{ 'min-width': '50rem' }"
          styleClass="library__table"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th>
              <th>Description</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td>{{ c.title }}</td>
              <td>{{ c.description }}</td>
              <td>{{ c.status }}</td>
              <td>
                <div class="library__row-actions">
                  <a [routerLink]="['/library', c.id]">
                    <p-button label="Edit" size="small" severity="secondary" />
                  </a>
                  <p-button label="Share" size="small" severity="info" (onClick)="openShare(c)" />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4">No library courses yet.</td>
            </tr>
          </ng-template>
        </p-table>
      }

      <!-- Share Panel -->
      @if (shareTarget()) {
        <p-card [header]="'Share: ' + shareTarget()!.title" styleClass="library__form-card">
          @if (tenantsLoading()) {
            <p>Loading tenants…</p>
          } @else {
            <div class="library__share-form">
              <p>Select tenants to share this course to:</p>
              @for (t of tenants(); track t.id) {
                <div class="library__tenant-row">
                  <p-checkbox
                    [binary]="true"
                    [ngModel]="isSelected(t.id)"
                    (ngModelChange)="toggleTenant(t.id, $event)"
                    [inputId]="'tenant-' + t.id"
                  />
                  <label [for]="'tenant-' + t.id">{{ t.name }} ({{ t.id }})</label>
                </div>
              }
              <div class="library__share-actions">
                <p-button
                  label="Share"
                  [loading]="shareLoading()"
                  [disabled]="selectedTenantIds().length === 0"
                  (onClick)="share()"
                />
                <p-button
                  label="Cancel"
                  severity="secondary"
                  [disabled]="shareLoading()"
                  (onClick)="closeShare()"
                />
              </div>
              @if (shareResult()) {
                <p class="library__share-result">
                  Shared successfully — {{ shareResult()!.created }} course(s) created.
                </p>
              }
              @if (shareError()) {
                <p class="library__error">{{ shareError() }}</p>
              }
            </div>
          }
        </p-card>
      }
    </section>
  `,
  styles: [
    `
      .library {
        max-width: 80rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .library__form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-start;
      }
      .library__field--wide {
        width: 100%;
        min-width: 20rem;
      }
      .library__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .library__row-actions {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .library__share-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .library__tenant-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .library__share-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .library__share-result {
        color: #15803d;
        margin-top: 0.25rem;
      }
    `,
  ],
})
export class LibraryComponent implements OnInit {
  private readonly libraryRepo = inject(LibraryRepository);
  private readonly tenantRepo = inject(TenantRepository);
  private readonly librarySvc = inject(LibraryService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected newTitle = '';
  protected newDescription = '';

  // Share state
  protected readonly shareTarget = signal<Course | null>(null);
  protected readonly tenants = signal<Tenant[]>([]);
  protected readonly tenantsLoading = signal(false);
  protected readonly selectedTenantIds = signal<string[]>([]);
  protected readonly shareLoading = signal(false);
  protected readonly shareResult = signal<{ ok: boolean; created: number } | null>(null);
  protected readonly shareError = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadCourses();
  }

  private async loadCourses(): Promise<void> {
    this.loading.set(true);
    this.createError.set(null);
    try {
      const result = await this.libraryRepo.list();
      this.courses.set(result);
    } catch (err) {
      this.createError.set((err as Error).message ?? 'Failed to load courses');
    } finally {
      this.loading.set(false);
    }
  }

  protected async createCourse(): Promise<void> {
    if (!this.newTitle) return;
    this.loading.set(true);
    this.createError.set(null);
    try {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const c: Course = {
        id,
        tenantId: LIBRARY_TENANT,
        title: this.newTitle,
        description: this.newDescription,
        status: 'published',
        badgeRefs: [],
        tags: [],
        xpReward: 0,
        createdAt: now,
      };
      await this.libraryRepo.setCourse(c);
      this.newTitle = '';
      this.newDescription = '';
      await this.loadCourses();
    } catch (err) {
      this.createError.set((err as Error).message ?? 'Failed to create course');
      this.loading.set(false);
    }
  }

  protected async openShare(course: Course): Promise<void> {
    this.shareTarget.set(course);
    this.selectedTenantIds.set([]);
    this.shareResult.set(null);
    this.shareError.set(null);
    this.tenantsLoading.set(true);
    try {
      const result = await this.tenantRepo.list();
      this.tenants.set(result);
    } catch (err) {
      this.shareError.set((err as Error).message ?? 'Failed to load tenants');
    } finally {
      this.tenantsLoading.set(false);
    }
  }

  protected closeShare(): void {
    this.shareTarget.set(null);
    this.selectedTenantIds.set([]);
    this.shareResult.set(null);
    this.shareError.set(null);
  }

  protected isSelected(tenantId: string): boolean {
    return this.selectedTenantIds().includes(tenantId);
  }

  protected toggleTenant(tenantId: string, checked: boolean): void {
    const current = this.selectedTenantIds();
    if (checked) {
      this.selectedTenantIds.set([...current, tenantId]);
    } else {
      this.selectedTenantIds.set(current.filter((id) => id !== tenantId));
    }
  }

  protected async share(): Promise<void> {
    const target = this.shareTarget();
    if (!target || this.selectedTenantIds().length === 0) return;
    this.shareLoading.set(true);
    this.shareError.set(null);
    this.shareResult.set(null);
    try {
      const result = await this.librarySvc.share({
        libraryCourseId: target.id,
        tenantIds: this.selectedTenantIds(),
      });
      this.shareResult.set(result);
      this.selectedTenantIds.set([]);
    } catch (err) {
      this.shareError.set((err as Error).message ?? 'Failed to share course');
    } finally {
      this.shareLoading.set(false);
    }
  }
}
