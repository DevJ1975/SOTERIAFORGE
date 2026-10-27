import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LearningApi, apiErrorMessage } from '@assurance/lms-core';
import type { ApiCourse, ApiMyEnrollment } from '@assurance/lms-core';

interface CourseItem {
  course: ApiCourse;
  enrollment: ApiMyEnrollment | null;
}

function isoDateToLocal(isoString: string): string {
  return isoString.slice(0, 10);
}

@Component({
  selector: 'assurance-learner-courses',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="courses" aria-labelledby="courses-heading">
      <h1 id="courses-heading" class="sf-h1">Courses</h1>
      @if (loading()) {
        <p class="courses__status sf-sub" role="status">Loading courses…</p>
      } @else if (error(); as message) {
        <div class="courses__error" role="alert">
          <p>{{ message }}</p>
          <button type="button" class="sf-btn sf-btn--secondary" (click)="load()">Try again</button>
        </div>
      } @else if (items().length === 0) {
        <p class="courses__status sf-sub">No published courses available yet.</p>
      } @else {
        <ul class="courses__list">
          @for (item of items(); track item.course.id) {
            <li class="courses__item sf-card">
              <h2 class="sf-h3">{{ item.course.title }}</h2>
              @if (item.course.description) {
                <p class="courses__desc">{{ item.course.description }}</p>
              }
              @if (item.enrollment; as enr) {
                @if (enr.assigned) {
                  <div class="courses__assigned">
                    <span class="sf-tag">Assigned</span>
                    @if (enr.dueAt) {
                      <span class="courses__due-date sf-sub"
                        >Due: {{ formatDueDate(enr.dueAt) }}</span
                      >
                    }
                  </div>
                }
                <p class="courses__progress sf-sub">
                  Progress: {{ enr.progressPct }}%
                  <progress
                    class="courses__bar"
                    max="100"
                    [value]="enr.progressPct"
                    [attr.aria-label]="'Progress for ' + item.course.title"
                  ></progress>
                </p>
              }
              <a
                [routerLink]="['/courses', item.course.id]"
                class="courses__link sf-btn sf-btn--primary"
                [attr.aria-label]="(item.enrollment ? 'Continue ' : 'Start ') + item.course.title"
                >{{ item.enrollment ? 'Continue' : 'Start' }} →</a
              >
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
      .courses__list {
        list-style: none;
        padding: 0;
        margin: 1rem 0 0;
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      }
      .courses__item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .courses__assigned {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .courses__progress {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
      }
      .courses__bar {
        flex: 1;
        height: 0.5rem;
      }
      .courses__link {
        margin-top: auto;
        align-self: flex-start;
        min-height: 44px;
        display: inline-flex;
        align-items: center;
        text-decoration: none;
      }
      .courses__error {
        margin-top: 1rem;
      }
    `,
  ],
})
export class CoursesComponent implements OnInit {
  private readonly api = inject(LearningApi);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  private readonly courses = signal<ApiCourse[]>([]);
  private readonly enrollments = signal<ApiMyEnrollment[]>([]);

  protected readonly items = computed<CourseItem[]>(() => {
    const byCourse = new Map(this.enrollments().map((e) => [e.courseId, e]));
    return this.courses().map((course) => ({
      course,
      enrollment: byCourse.get(course.id) ?? null,
    }));
  });

  protected formatDueDate(iso: string): string {
    return isoDateToLocal(iso);
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [courses, enrollments] = await Promise.all([
        this.api.courses(),
        this.api.myEnrollments(),
      ]);
      this.courses.set(courses);
      this.enrollments.set(enrollments);
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Could not load courses. Please try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
