import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { CourseRepository } from '@forge/data-access';
import { CourseAuthoringService } from '@forge/lms-core';
import { TenantService } from '@forge/auth';
import type { Course } from '@forge/shared';

@Component({
  selector: 'forge-admin-courses',
  standalone: true,
  imports: [RouterLink, FormsModule, ButtonModule, InputTextModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="courses">
      <h1>Courses</h1>

      <!-- New Course Form -->
      <div class="courses__new-form">
        <h2>New Course</h2>
        <div class="courses__form-row">
          <input
            pInputText
            type="text"
            placeholder="Course title"
            [(ngModel)]="newTitle"
            aria-label="Course title"
          />
          <input
            pInputText
            type="text"
            placeholder="Description (optional)"
            [(ngModel)]="newDescription"
            aria-label="Course description"
          />
          <p-button
            label="Create Course"
            [loading]="creating()"
            [disabled]="!newTitle.trim()"
            (onClick)="createCourse()"
          />
        </div>
        @if (createError()) {
          <p class="courses__error">{{ createError() }}</p>
        }
      </div>

      <!-- Courses Table -->
      @if (loading()) {
        <p>Loading courses…</p>
      } @else if (loadError()) {
        <p class="courses__error">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="courses()"
          [paginator]="courses().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
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
              <td>
                <a [routerLink]="['/courses', c.id]">{{ c.title }}</a>
              </td>
              <td>{{ c.description || '—' }}</td>
              <td>{{ c.status }}</td>
              <td class="courses__actions">
                <p-button
                  label="Manage Modules"
                  severity="secondary"
                  size="small"
                  [routerLink]="['/courses', c.id]"
                />
                @if (c.status !== 'published') {
                  <p-button
                    label="Publish"
                    severity="success"
                    size="small"
                    [loading]="publishingId() === c.id"
                    (onClick)="publish(c)"
                  />
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4">No courses found. Create your first course above.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .courses {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .courses__new-form {
        background: var(--forge-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .courses__form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .courses__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .courses__actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class CoursesComponent implements OnInit {
  private readonly courseRepo = inject(CourseRepository);
  private readonly authoringService = inject(CourseAuthoringService);
  private readonly tenantService = inject(TenantService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);
  protected readonly publishingId = signal<string | null>(null);

  protected newTitle = '';
  protected newDescription = '';

  ngOnInit(): void {
    void this.loadCourses();
  }

  private async loadCourses(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.courseRepo.listAll(tid);
      this.courses.set(list);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load courses');
    } finally {
      this.loading.set(false);
    }
  }

  protected async createCourse(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid || !this.newTitle.trim()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      await this.authoringService.createCourse({
        tenantId: tid,
        title: this.newTitle.trim(),
        description: this.newDescription.trim() || undefined,
      });
      this.newTitle = '';
      this.newDescription = '';
      await this.loadCourses();
    } catch (err) {
      this.createError.set((err as Error).message ?? 'Failed to create course');
    } finally {
      this.creating.set(false);
    }
  }

  protected async publish(c: Course): Promise<void> {
    this.publishingId.set(c.id);
    try {
      await this.authoringService.publish(c);
      await this.loadCourses();
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Publish failed');
    } finally {
      this.publishingId.set(null);
    }
  }
}
