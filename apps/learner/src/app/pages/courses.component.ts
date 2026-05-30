import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { CourseRepository, EnrollmentRepository } from '@assurance/data-access';
import { AuthService, TenantService } from '@assurance/auth';
import type { Course, Enrollment } from '@assurance/shared';

function isoDateToLocal(isoString: string): string {
  return isoString.slice(0, 10);
}

interface CourseWithAssignment {
  course: Course;
  enrollment: Enrollment | null;
}

@Component({
  selector: 'assurance-learner-courses',
  standalone: true,
  imports: [RouterLink, CardModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="courses" aria-labelledby="courses-heading">
      <h1 id="courses-heading">Courses</h1>
      @if (loading()) {
        <p class="courses__status">Loading courses…</p>
      } @else if (courseItems().length === 0) {
        <p class="courses__status">No published courses available yet.</p>
      } @else {
        <ul class="courses__list">
          @for (item of courseItems(); track item.course.id) {
            <li class="courses__item">
              <p-card [header]="item.course.title">
                @if (item.course.description) {
                  <p>{{ item.course.description }}</p>
                }
                @if (item.enrollment?.assigned) {
                  <div class="courses__assigned">
                    <p-tag severity="info" value="Assigned" />
                    @if (item.enrollment?.dueAt) {
                      <span class="courses__due-date"
                        >Due: {{ formatDueDate(item.enrollment!.dueAt!) }}</span
                      >
                    }
                  </div>
                }
                <a
                  [routerLink]="['/courses', item.course.id]"
                  class="courses__link"
                  [attr.aria-label]="'Start ' + item.course.title"
                  >Start →</a
                >
              </p-card>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [
    `
      .courses {
        max-width: 60rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .courses__status {
        color: var(--assurance-text-muted, #666);
      }
      .courses__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      }
      .courses__item {
        display: flex;
        flex-direction: column;
      }
      .courses__assigned {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .courses__due-date {
        font-size: 0.8125rem;
        color: var(--assurance-text-muted, #666);
      }
      .courses__link {
        display: inline-block;
        margin-top: 0.75rem;
        color: var(--assurance-primary, #0b5fff);
        text-decoration: none;
        font-weight: 600;
      }
      .courses__link:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class CoursesComponent implements OnInit {
  private readonly courseRepo = inject(CourseRepository);
  private readonly enrollmentRepo = inject(EnrollmentRepository);
  private readonly auth = inject(AuthService);
  private readonly tenantService = inject(TenantService);

  protected readonly courseItems = signal<CourseWithAssignment[]>([]);
  protected readonly loading = signal(true);

  protected formatDueDate(iso: string): string {
    return isoDateToLocal(iso);
  }

  async ngOnInit(): Promise<void> {
    const tenantId = this.tenantService.tenantId();
    if (!tenantId) {
      this.loading.set(false);
      return;
    }
    try {
      const courses = await this.courseRepo.listPublished(tenantId);
      // Build initial items without enrollment data so courses appear quickly.
      this.courseItems.set(courses.map((c) => ({ course: c, enrollment: null })));

      // Best-effort: check assignments for the current learner.
      const uid = this.auth.principal()?.uid;
      if (uid) {
        const enrollments = await Promise.allSettled(
          courses.map((c) => this.enrollmentRepo.get(tenantId, c.id, uid)),
        );
        this.courseItems.set(
          courses.map((c, i) => {
            const result = enrollments[i];
            const enrollment = result.status === 'fulfilled' && result.value ? result.value : null;
            return { course: c, enrollment };
          }),
        );
      }
    } catch (err) {
      console.error('[CoursesComponent] Failed to load courses', err);
    } finally {
      this.loading.set(false);
    }
  }
}
