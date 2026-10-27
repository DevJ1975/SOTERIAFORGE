import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, TenantService } from '@assurance/auth';
import { TutorChatComponent } from '@assurance/ai-tutor';
import {
  LearningApi,
  apiErrorMessage,
  type ApiCourseOutline,
  type ApiLessonSummary,
  type ContentType,
} from '@assurance/lms-core';
import { SfIconComponent, SfProgressRingComponent } from '@assurance/ui';

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  video: 'Video',
  scorm: 'SCORM',
  cmi5: 'cmi5',
  quiz: 'Quiz',
  game: 'Game',
  unity: 'Simulation',
};

/** Course outline: progress, modules (with labels such as "Week 5") and their lessons. */
@Component({
  selector: 'assurance-learner-course-detail',
  standalone: true,
  imports: [RouterLink, SfIconComponent, SfProgressRingComponent, TutorChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cd" aria-labelledby="cd-heading">
      <nav aria-label="Course navigation">
        <a class="sf-btn sf-btn--ghost cd__back" routerLink="/courses"> &larr; Back to courses </a>
      </nav>

      @if (loading()) {
        <p class="sf-sub" role="status">Loading course…</p>
      } @else if (error(); as message) {
        <div class="sf-card cd__error" role="alert">
          <h1 class="sf-h2" id="cd-heading">We could not open this course</h1>
          <p>{{ message }}</p>
          <button type="button" class="sf-btn sf-btn--secondary" (click)="load()">Try again</button>
        </div>
      } @else if (course(); as c) {
        <header class="sf-card cd__head">
          <sf-progress-ring
            [value]="progressPct()"
            [caption]="progressPct() + '%'"
            [label]="c.title + ' progress'"
            [size]="112"
          />
          <div class="cd__head-body">
            <h1 class="sf-h1" id="cd-heading">{{ c.title }}</h1>
            @if (c.description) {
              <p class="cd__desc">{{ c.description }}</p>
            }
            <p class="sf-sub cd__stats">
              <span>Progress: {{ progressPct() }}% complete</span>
              @if (totalMinutes() > 0) {
                <span>Total: {{ totalMinutes() }} min</span>
              }
              <span>{{ lessonCount() }} {{ lessonCount() === 1 ? 'lesson' : 'lessons' }}</span>
            </p>
          </div>
        </header>

        @if (c.modules.length === 0) {
          <p class="sf-sub">No lessons have been added to this course yet.</p>
        }

        @for (mod of c.modules; track mod.id) {
          <section class="cd__module" [attr.aria-labelledby]="'cd-mod-' + mod.id">
            <h2 class="sf-h3" [id]="'cd-mod-' + mod.id">
              @if (mod.label) {
                <span class="sf-tag sf-tag--navy cd__label">{{ mod.label }}</span>
              }
              {{ mod.title }}
            </h2>
            <ul class="cd__lessons">
              @for (lesson of mod.lessons; track lesson.id) {
                <li>
                  <a
                    class="sf-card cd__lesson"
                    [class.cd__lesson--done]="lesson.completed"
                    [routerLink]="['/courses', c.id, 'lessons', lesson.id]"
                  >
                    <span class="cd__check" aria-hidden="true">
                      @if (lesson.completed) {
                        <sf-icon name="check" size="sm" />
                      }
                    </span>
                    <span class="cd__lesson-body">
                      <span class="cd__lesson-title">{{ lesson.title }}</span>
                      <span class="cd__meta">
                        <span class="sf-tag">{{ typeLabel(lesson) }}</span>
                        @if (lesson.estimatedMinutes !== null) {
                          <span class="sf-sub">{{ lesson.estimatedMinutes }} min</span>
                        }
                        @if (lesson.hasQuiz) {
                          <span class="sf-tag sf-tag--ember">Knowledge check</span>
                        }
                        @for (tag of lesson.frameworkTags; track tag) {
                          <span class="sf-tag sf-tag--navy">{{ tag }}</span>
                        }
                      </span>
                    </span>
                    <span class="cd__status">
                      {{ lesson.completed ? 'Completed' : 'Not completed' }}
                    </span>
                  </a>
                </li>
              }
            </ul>
          </section>
        }

        @if (tenantId() && uid()) {
          <details class="sf-card cd__tutor">
            <summary class="cd__tutor-summary">Ask the AI Tutor</summary>
            <div class="cd__tutor-chat" role="region" aria-label="AI Tutor chat">
              <assurance-tutor-chat [tenantId]="tenantId()!" [uid]="uid()!" [courseId]="c.id" />
            </div>
          </details>
        }
      }
    </section>
  `,
  styles: [
    `
      .cd {
        max-width: 60rem;
        margin: var(--sf-space-6, 1.5rem) auto;
        padding: 0 1rem;
        display: grid;
        gap: var(--sf-space-5, 1.25rem);
      }
      .cd__back {
        min-height: 44px;
        text-decoration: none;
      }
      .cd__head {
        display: flex;
        align-items: center;
        gap: var(--sf-space-5, 1.25rem);
      }
      .cd__head-body {
        min-width: 0;
        flex: 1;
      }
      .cd__desc {
        margin: var(--sf-space-2, 0.5rem) 0 0;
      }
      .cd__stats {
        display: flex;
        flex-wrap: wrap;
        gap: var(--sf-space-1, 0.25rem) var(--sf-space-4, 1rem);
        margin: var(--sf-space-3, 0.75rem) 0 0;
      }
      .cd__module {
        display: grid;
        gap: var(--sf-space-3, 0.75rem);
      }
      .cd__label {
        margin-right: var(--sf-space-2, 0.5rem);
      }
      .cd__lessons {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: var(--sf-space-2, 0.5rem);
      }
      .cd__lesson {
        display: flex;
        align-items: center;
        gap: var(--sf-space-3, 0.75rem);
        min-height: 44px;
        padding: var(--sf-space-3, 0.75rem) var(--sf-space-4, 1rem);
        color: inherit;
        text-decoration: none;
      }
      .cd__lesson:hover {
        border-color: var(--sf-ember, #dc481b);
      }
      .cd__lesson:focus-visible {
        outline: 3px solid var(--sf-ember, #dc481b);
        outline-offset: 2px;
      }
      .cd__check {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 2px solid currentColor;
        border-radius: 50%;
      }
      .cd__lesson--done .cd__check {
        background: var(--sf-success-soft, #e3f5ec);
        color: #157a52;
      }
      .cd__lesson-body {
        flex: 1;
        min-width: 0;
        display: grid;
        gap: 4px;
      }
      .cd__lesson-title {
        font-weight: 600;
      }
      .cd__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .cd__status {
        flex: none;
        font-size: 0.8125rem;
      }
      .cd__tutor-summary {
        cursor: pointer;
        min-height: 44px;
        display: flex;
        align-items: center;
        font-weight: 600;
      }
      .cd__tutor-chat {
        height: 24rem;
      }
      @media (max-width: 30rem) {
        .cd__head {
          flex-direction: column;
          align-items: flex-start;
        }
        .cd__lesson {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class CourseDetailComponent implements OnInit {
  /** Route param, bound via withComponentInputBinding. */
  readonly id = input.required<string>();

  private readonly api = inject(LearningApi);
  private readonly auth = inject(AuthService);
  private readonly tenantSvc = inject(TenantService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly course = signal<ApiCourseOutline | null>(null);

  protected readonly tenantId = computed(() => this.tenantSvc.tenantId() ?? null);
  protected readonly uid = computed(() => this.auth.principal()?.uid ?? null);

  protected readonly progressPct = computed(() =>
    Math.round(this.course()?.enrollment?.progressPct ?? 0),
  );
  protected readonly totalMinutes = computed(() =>
    (this.course()?.modules ?? []).reduce(
      (sum, m) => sum + m.lessons.reduce((s, l) => s + (l.estimatedMinutes ?? 0), 0),
      0,
    ),
  );
  protected readonly lessonCount = computed(() =>
    (this.course()?.modules ?? []).reduce((sum, m) => sum + m.lessons.length, 0),
  );

  ngOnInit(): void {
    void this.load();
  }

  protected typeLabel(lesson: ApiLessonSummary): string {
    return CONTENT_TYPE_LABELS[lesson.contentType] ?? lesson.contentType;
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const courseId = this.id();
      let outline = await this.api.course(courseId);
      if (!outline.enrollment && outline.status === 'published') {
        // Idempotent; then refresh so the outline carries the enrollment.
        await this.api.enroll(courseId);
        outline = await this.api.course(courseId);
      }
      this.course.set(outline);
    } catch (err) {
      this.course.set(null);
      this.error.set(apiErrorMessage(err, 'The course could not be loaded. Please try again.'));
    } finally {
      this.loading.set(false);
    }
  }
}
