import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { PrincipalStore } from '@forge/auth';
import {
  completedLessonsOf,
  ForgeCatalog,
  ForgeEnrollment,
  ForgeLessonRenderer,
  nextEnrollment,
} from '@forge/lms-core';
import type { CourseDraft, Enrollment } from '@forge/shared';

type PlayerState = 'loading' | 'ready' | 'missing' | 'error';

/**
 * Course player: lesson rail (free navigation, completion checkmarks), the
 * current lesson rendered via ForgeLessonRenderer, and a 'Mark lesson
 * complete' CTA persisting progress through ForgeEnrollment (optimistic UI
 * with an inline error toast on failure).
 *
 * Note: ForgeLessonRenderer keeps knowledge-check answers internal (no
 * outputs), so completion is the explicit CTA only — no auto-complete on
 * scroll/answers, and no knowledge-check score is recorded yet.
 */
@Component({
  selector: 'app-player-page',
  imports: [RouterLink, ButtonModule, ForgeLessonRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      @switch (state()) {
        @case ('loading') {
          <div class="loading-stack" aria-hidden="true">
            <div class="skeleton bar"></div>
            <div class="skeleton canvas"></div>
          </div>
        }
        @case ('missing') {
          <section class="forge-card notice">
            <h3>Course unavailable</h3>
            <p>This course doesn't exist or isn't published for your team.</p>
            <p-button label="Back to catalog" routerLink="/courses" />
          </section>
        }
        @case ('error') {
          <section class="forge-card notice">
            <h3>Couldn't load the course</h3>
            <p>Something went wrong talking to the training service. Refresh to try again.</p>
            <p-button label="Back to catalog" routerLink="/courses" />
          </section>
        }
        @case ('ready') {
          @if (course(); as course) {
            <header class="player-head">
              <a class="back-link" routerLink="/courses">&larr; All courses</a>
              <h1>{{ course.title }}</h1>
              <div class="progress-row">
                <div
                  class="progress-track"
                  role="progressbar"
                  [attr.aria-valuenow]="progressPct()"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <div class="progress-fill" [style.width.%]="progressPct()"></div>
                </div>
                <span class="progress-label">{{ progressPct() }}%</span>
              </div>
            </header>

            @if (saveError(); as message) {
              <div class="toast" role="alert">{{ message }}</div>
            }

            @if (celebrating()) {
              <section class="forge-card celebration">
                <p class="forge-tagline">Training record updated</p>
                <h2>Course complete</h2>
                <p>
                  You've finished every lesson in <strong>{{ course.title }}</strong
                  >. Nice work — stay sharp out there.
                </p>
                @if (enrollment()?.score !== undefined) {
                  <p class="score">Knowledge-check score: {{ enrollment()?.score }}%</p>
                }
                <div class="celebration-actions">
                  <p-button label="Back to catalog" routerLink="/courses" />
                  <p-button
                    label="Review lessons"
                    [outlined]="true"
                    (onClick)="celebrating.set(false)"
                  />
                </div>
              </section>
            } @else {
              <div class="player-layout">
                <nav class="lesson-rail forge-card" aria-label="Lessons">
                  <h2>Lessons</h2>
                  <ol>
                    @for (lesson of lessons(); track lesson.id; let i = $index) {
                      <li>
                        <button
                          type="button"
                          class="rail-item"
                          [class.current]="i === currentIndex()"
                          [attr.aria-current]="i === currentIndex() ? 'true' : null"
                          (click)="goTo(i)"
                        >
                          <span
                            class="check"
                            [class.done]="isCompleted(lesson.id)"
                            aria-hidden="true"
                            >&#10003;</span
                          >
                          <span class="rail-title">{{ lesson.title }}</span>
                        </button>
                      </li>
                    }
                  </ol>
                </nav>

                <section class="lesson-main">
                  @if (currentLesson(); as lesson) {
                    <article class="lesson-canvas forge-card">
                      <h2 class="lesson-title">{{ lesson.title }}</h2>
                      <forge-lesson-renderer [lesson]="lesson" />
                    </article>
                    <footer class="lesson-actions">
                      <p-button
                        label="Previous"
                        [outlined]="true"
                        [disabled]="currentIndex() === 0"
                        (onClick)="goTo(currentIndex() - 1)"
                      />
                      @if (isCompleted(lesson.id)) {
                        <span class="done-note">&#10003; Lesson completed</span>
                      } @else {
                        <p-button
                          [label]="saving() ? 'Saving…' : 'Mark lesson complete'"
                          [disabled]="saving()"
                          (onClick)="markComplete()"
                        />
                      }
                      <p-button
                        label="Next"
                        [outlined]="true"
                        [disabled]="currentIndex() >= lessons().length - 1"
                        (onClick)="goTo(currentIndex() + 1)"
                      />
                    </footer>
                  } @else {
                    <div class="forge-card notice">
                      <p>This course has no lessons yet.</p>
                    </div>
                  }
                </section>
              </div>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    .player-head {
      margin-bottom: 20px;
    }

    .player-head h1 {
      margin-bottom: 8px;
    }

    .back-link {
      font-size: 13px;
    }

    .progress-row {
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 520px;
    }

    .progress-track {
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: var(--forge-surface);
      border: 1px solid var(--forge-border);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--sf-grad-ember);
      border-radius: 4px;
      transition: width 200ms ease-out;
    }

    .progress-label {
      font-weight: 600;
      font-size: 13px;
      color: var(--forge-text-subtle);
      min-width: 38px;
    }

    .toast {
      background: color-mix(in srgb, var(--forge-negative) 10%, var(--forge-surface));
      border: 1px solid var(--forge-negative);
      color: var(--forge-negative);
      border-radius: var(--forge-radius);
      padding: 10px 16px;
      margin-bottom: 16px;
    }

    .player-layout {
      display: grid;
      grid-template-columns: 260px minmax(0, 1fr);
      gap: 24px;
      align-items: start;
    }

    @media (max-width: 860px) {
      .player-layout {
        grid-template-columns: 1fr;
      }
    }

    .lesson-rail {
      position: sticky;
      top: 76px;
      padding: 16px;
    }

    .lesson-rail h2 {
      font-size: 14px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--forge-text-subtle);
      margin-bottom: 8px;
    }

    .lesson-rail ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .rail-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      border-radius: var(--forge-radius-small);
      padding: 8px 10px;
      font: inherit;
      color: var(--forge-text);
      cursor: pointer;
    }

    .rail-item:hover {
      background: var(--forge-surface-dim);
    }

    .rail-item.current {
      background: color-mix(in srgb, var(--sf-ember) 12%, var(--forge-surface));
      color: var(--sf-ember-hover);
      font-weight: 600;
    }

    .check {
      flex: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1px solid var(--forge-border);
      display: grid;
      place-items: center;
      font-size: 11px;
      color: transparent;
      background: var(--forge-surface);
    }

    .check.done {
      background: var(--forge-positive);
      border-color: var(--forge-positive);
      color: #fff;
    }

    .lesson-canvas {
      max-width: 760px;
    }

    .lesson-title {
      margin-bottom: 16px;
    }

    .lesson-actions {
      max-width: 760px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
    }

    .done-note {
      color: var(--forge-positive);
      font-weight: 600;
    }

    .celebration {
      max-width: 560px;
      margin: 32px auto;
      text-align: center;
      border-top: 4px solid var(--sf-ember);
    }

    .celebration .score {
      font-weight: 600;
    }

    .celebration-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-top: 16px;
    }

    .notice p {
      color: var(--forge-text-subtle);
    }

    .loading-stack {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .skeleton {
      border-radius: var(--forge-radius);
      background: linear-gradient(
        100deg,
        var(--forge-surface-dim) 40%,
        var(--forge-border) 50%,
        var(--forge-surface-dim) 60%
      );
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    .skeleton.bar {
      height: 56px;
      max-width: 520px;
    }

    .skeleton.canvas {
      height: 420px;
      max-width: 760px;
    }

    @keyframes shimmer {
      to {
        background-position: -200% 0;
      }
    }
  `,
})
export class PlayerPage {
  private readonly db = inject(Firestore);
  private readonly route = inject(ActivatedRoute);
  private readonly catalog = inject(ForgeCatalog);
  private readonly enrollments = inject(ForgeEnrollment);
  private readonly principal = inject(PrincipalStore);

  private readonly courseId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('courseId'))),
    { initialValue: this.route.snapshot.paramMap.get('courseId') },
  );

  protected readonly state = signal<PlayerState>('loading');
  protected readonly course = signal<CourseDraft | null>(null);
  protected readonly enrollment = signal<Enrollment | null>(null);
  protected readonly currentIndex = signal(0);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  /** Full-course celebration card, shown when the course completes. */
  protected readonly celebrating = signal(false);

  protected readonly lessons = computed(() => this.course()?.lessons ?? []);
  protected readonly currentLesson = computed(() => this.lessons()[this.currentIndex()] ?? null);
  protected readonly completedIds = computed(() => new Set(completedLessonsOf(this.enrollment())));
  protected readonly progressPct = computed(() => this.enrollment()?.progressPct ?? 0);

  /** Guards the load effect against re-running for the same course/principal. */
  private loadedFor: string | null = null;

  constructor() {
    this.principal.init();
    effect(() => {
      const courseId = this.courseId();
      const status = this.principal.status();
      const tenantId = this.principal.tenantId();
      const uid = this.principal.uid();
      if (status === 'loading') return;
      if (!courseId || status === 'signedOut' || !tenantId || !uid) {
        this.state.set('missing');
        return;
      }
      const key = `${tenantId}:${uid}:${courseId}`;
      if (this.loadedFor === key) return;
      this.loadedFor = key;
      void this.load(courseId, tenantId, uid);
    });
  }

  protected isCompleted(lessonId: string): boolean {
    return this.completedIds().has(lessonId);
  }

  protected goTo(index: number): void {
    if (index < 0 || index >= this.lessons().length) return;
    this.currentIndex.set(index);
  }

  /**
   * Persists the current lesson as complete: optimistic local update first,
   * rolled back with an inline error toast if the Firestore write fails.
   */
  protected async markComplete(): Promise<void> {
    const course = this.course();
    const lesson = this.currentLesson();
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!course || !lesson || !tenantId || !uid || this.saving()) return;

    const previous = this.enrollment();
    const optimistic = nextEnrollment({
      tenantId,
      uid,
      course,
      lessonId: lesson.id,
      existing: previous,
    });
    this.saveError.set(null);
    this.enrollment.set(optimistic);
    if (optimistic.completed && !previous?.completed) this.celebrating.set(true);

    this.saving.set(true);
    try {
      const persisted = await this.enrollments.markLessonComplete(this.db, {
        tenantId,
        uid,
        course,
        lessonId: lesson.id,
        existing: previous,
      });
      this.enrollment.set(persisted);
    } catch (error) {
      console.error('[learner] failed to save lesson completion', error);
      this.enrollment.set(previous);
      this.celebrating.set(false);
      this.saveError.set('Could not save your progress — check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private async load(courseId: string, tenantId: string, uid: string): Promise<void> {
    this.state.set('loading');
    try {
      const [course, enrollment] = await Promise.all([
        this.catalog.getPublished(this.db, tenantId, courseId),
        this.enrollments.get(this.db, tenantId, courseId, uid),
      ]);
      if (!course) {
        this.state.set('missing');
        return;
      }
      this.course.set(course);
      this.enrollment.set(enrollment ?? null);
      // Resume at the first incomplete lesson (or the top, when done).
      const done = new Set(completedLessonsOf(enrollment ?? null));
      const firstIncomplete = course.lessons.findIndex((lesson) => !done.has(lesson.id));
      this.currentIndex.set(firstIncomplete === -1 ? 0 : firstIncomplete);
      this.state.set('ready');
    } catch (error) {
      console.error('[learner] failed to load the course player', error);
      this.state.set('error');
    }
  }
}
