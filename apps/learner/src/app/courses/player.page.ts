import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
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
  scoreFor,
  type CheckAnsweredEvent,
  type ChecksStateEvent,
} from '@forge/lms-core';
import type { CourseDraft, Enrollment, LessonDraft } from '@forge/shared';

type PlayerState = 'loading' | 'ready' | 'missing' | 'error';

/** Aggregate knowledge-check state for one lesson (renderer `checksState`). */
export interface LessonChecksSnapshot {
  total: number;
  answered: number;
  correctOnFirstAttempt: number;
}

/**
 * Auto-completion decision: a lesson completes by itself exactly when it has
 * knowledge checks, every one of them has been answered, the learner has
 * reached the end of the lesson, and it isn't already complete. Lessons
 * without checks (total 0, or no renderer state yet) stay manual-CTA only.
 */
export function shouldAutoComplete(args: {
  checks: LessonChecksSnapshot | undefined;
  endReached: boolean;
  alreadyComplete: boolean;
}): boolean {
  const { checks, endReached, alreadyComplete } = args;
  if (alreadyComplete) return false;
  if (!checks || checks.total === 0) return false;
  return checks.answered >= checks.total && endReached;
}

/**
 * Course player: lesson rail (free navigation, completion checkmarks, an
 * ember dot on visited lessons with unanswered checks), the current lesson
 * rendered via ForgeLessonRenderer, and completion persisted through
 * ForgeEnrollment (optimistic UI with an inline error toast on failure).
 *
 * Lessons with knowledge checks auto-complete once every check is answered
 * and the learner reaches the end-of-lesson sentinel (IntersectionObserver;
 * short lessons intersect immediately, environments without the API are
 * treated as end-reached). First-attempt correctness per check feeds
 * `knowledgeCheckResults`, so enrollments carry a real score. Lessons without
 * checks keep the explicit CTA; checked lessons keep it as a fallback
 * ('Mark complete anyway').
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

            @if (completionToast()) {
              <div class="complete-toast" role="status">Lesson complete &#10003;</div>
            }

            @if (celebrating()) {
              <section class="forge-card celebration">
                <p class="forge-tagline">Training record updated</p>
                <h2>Course complete</h2>
                <p>
                  You've finished every lesson in <strong>{{ course.title }}</strong
                  >. Nice work — stay sharp out there.
                </p>
                @if (courseScore() !== undefined) {
                  <p class="score">Knowledge-check score: {{ courseScore() }}%</p>
                }
                @if (firstTryBreakdown(); as breakdown) {
                  <p class="score-note">
                    You nailed {{ breakdown.correct }} of {{ breakdown.total }}
                    {{ breakdown.total === 1 ? 'check or quiz' : 'checks & quizzes' }} on the first
                    try.
                  </p>
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
                          @if (hasUnansweredChecks(lesson.id)) {
                            <span
                              class="ember-dot"
                              title="Knowledge checks remaining"
                              aria-hidden="true"
                            ></span>
                          }
                        </button>
                      </li>
                    }
                  </ol>
                </nav>

                <section class="lesson-main">
                  @if (currentLesson(); as lesson) {
                    <article class="lesson-canvas forge-card">
                      <h2 class="lesson-title">{{ lesson.title }}</h2>
                      <forge-lesson-renderer
                        [lesson]="lesson"
                        (checkAnswered)="onCheckAnswered(lesson.id, $event)"
                        (checksState)="onChecksState(lesson.id, $event)"
                      />
                    </article>
                    <div #lessonEnd class="lesson-end-sentinel" aria-hidden="true"></div>
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
                          [label]="
                            saving()
                              ? 'Saving…'
                              : currentHasChecks()
                                ? 'Mark complete anyway'
                                : 'Mark lesson complete'
                          "
                          [outlined]="currentHasChecks()"
                          [disabled]="saving()"
                          (onClick)="markComplete()"
                        />
                      }
                      <p-button
                        label="Next"
                        [outlined]="true"
                        [class.pulse-next]="nextPulse()"
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

    .complete-toast {
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      background: color-mix(in srgb, var(--sf-ember) 14%, var(--forge-surface));
      border: 1px solid var(--sf-ember);
      color: var(--sf-ember-hover);
      border-radius: var(--forge-radius);
      padding: 10px 18px;
      font-weight: 600;
      box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
      animation: toast-in 130ms ease-out;
      z-index: 30;
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translate(-50%, 8px);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
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

    .ember-dot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--sf-ember);
      margin-left: auto;
    }

    .lesson-canvas {
      max-width: 760px;
    }

    .lesson-title {
      margin-bottom: 16px;
    }

    .lesson-end-sentinel {
      height: 1px;
      max-width: 760px;
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

    p-button.pulse-next {
      display: inline-block;
      animation: next-pulse 1.4s ease-in-out 3;
    }

    @keyframes next-pulse {
      0%,
      100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.04);
      }
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

    .celebration .score-note {
      color: var(--forge-text-subtle);
      font-size: 14px;
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);

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
  /** Ember 'Lesson complete' banner, shown briefly on auto-completion. */
  protected readonly completionToast = signal(false);
  /** Lesson that just completed (drives the subtle Next-button pulse). */
  private readonly justCompletedId = signal<string | null>(null);

  /** lessonId → latest aggregate from the renderer (visited lessons only). */
  private readonly checkStates = signal<Record<string, LessonChecksSnapshot>>({});
  /** lessonId → blockId → correctness of the learner's first attempt. */
  private readonly checkResults = signal<Record<string, Record<string, boolean>>>({});
  /** Lessons whose end-of-lesson sentinel has come into view. */
  private readonly endReachedIds = signal<ReadonlySet<string>>(new Set());

  private readonly lessonEnd = viewChild<ElementRef<HTMLElement>>('lessonEnd');

  protected readonly lessons = computed(() => this.course()?.lessons ?? []);
  protected readonly currentLesson = computed(() => this.lessons()[this.currentIndex()] ?? null);
  protected readonly completedIds = computed(() => new Set(completedLessonsOf(this.enrollment())));
  protected readonly progressPct = computed(() => this.enrollment()?.progressPct ?? 0);

  /** True once the renderer reported knowledge checks in the current lesson. */
  protected readonly currentHasChecks = computed(() => {
    const lesson = this.currentLesson();
    return !!lesson && (this.checkStates()[lesson.id]?.total ?? 0) > 0;
  });

  /** Pulse the Next button right after the current lesson completed. */
  protected readonly nextPulse = computed(() => {
    const lesson = this.currentLesson();
    return (
      !!lesson &&
      this.justCompletedId() === lesson.id &&
      this.currentIndex() < this.lessons().length - 1
    );
  });

  /** Knowledge checks + quizzes across the whole course (a quiz is one check). */
  private readonly courseCheckTotal = computed(() =>
    this.lessons().reduce(
      (sum, lesson) =>
        sum + lesson.blocks.filter((b) => b.kind === 'knowledgeCheck' || b.kind === 'quiz').length,
      0,
    ),
  );

  /** Every first-attempt result collected this session, flattened. */
  private readonly sessionResults = computed(() =>
    Object.values(this.checkResults()).flatMap((perBlock) => Object.values(perBlock)),
  );

  /**
   * Score for the celebration card: the live session average once every check
   * in the course has been answered this session, otherwise the persisted
   * enrollment score (falling back to a partial session average).
   */
  protected readonly courseScore = computed(() => {
    const session = this.sessionResults();
    const total = this.courseCheckTotal();
    if (total > 0 && session.length >= total) return scoreFor(session);
    return this.enrollment()?.score ?? scoreFor(session);
  });

  /** 'You nailed X of Y' line — only when this session covered every check. */
  protected readonly firstTryBreakdown = computed(() => {
    const total = this.courseCheckTotal();
    const session = this.sessionResults();
    if (total === 0 || session.length < total) return null;
    return { correct: session.filter(Boolean).length, total };
  });

  /** Guards the load effect against re-running for the same course/principal. */
  private loadedFor: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.principal.init();
    this.destroyRef.onDestroy(() => clearTimeout(this.toastTimer));
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

    // Watch the end-of-lesson sentinel per lesson. Short lessons intersect
    // immediately; environments without IntersectionObserver (SSR shells,
    // jsdom) treat the end as reached so auto-completion still works.
    effect((onCleanup) => {
      const sentinel = this.lessonEnd()?.nativeElement;
      const lessonId = this.currentLesson()?.id;
      if (!sentinel || !lessonId) return;
      untracked(() => {
        if (typeof IntersectionObserver === 'undefined') {
          this.markEndReached(lessonId);
          return;
        }
        const observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer.disconnect();
            this.markEndReached(lessonId);
          }
        });
        observer.observe(sentinel);
        onCleanup(() => observer.disconnect());
      });
    });
  }

  protected isCompleted(lessonId: string): boolean {
    return this.completedIds().has(lessonId);
  }

  /** Ember rail dot: the learner saw this lesson but left checks unanswered. */
  protected hasUnansweredChecks(lessonId: string): boolean {
    if (this.isCompleted(lessonId)) return false;
    const checks = this.checkStates()[lessonId];
    return !!checks && checks.total > 0 && checks.answered < checks.total;
  }

  protected goTo(index: number): void {
    if (index < 0 || index >= this.lessons().length) return;
    this.currentIndex.set(index);
  }

  protected onCheckAnswered(lessonId: string, event: CheckAnsweredEvent): void {
    if (!event.firstAttempt) return; // retries never re-score
    this.checkResults.update((all) => ({
      ...all,
      [lessonId]: { ...(all[lessonId] ?? {}), [event.blockId]: event.correct },
    }));
  }

  protected onChecksState(lessonId: string, state: ChecksStateEvent): void {
    this.checkStates.update((all) => ({ ...all, [lessonId]: state }));
    this.maybeAutoComplete();
  }

  protected markComplete(): void {
    const lesson = this.currentLesson();
    if (lesson) void this.completeLesson(lesson, 'manual');
  }

  private markEndReached(lessonId: string): void {
    if (this.endReachedIds().has(lessonId)) return;
    this.endReachedIds.update((ids) => new Set(ids).add(lessonId));
    this.maybeAutoComplete();
  }

  private maybeAutoComplete(): void {
    const lesson = this.currentLesson();
    if (!lesson || this.saving()) return;
    const complete = shouldAutoComplete({
      checks: this.checkStates()[lesson.id],
      endReached: this.endReachedIds().has(lesson.id),
      alreadyComplete: this.isCompleted(lesson.id),
    });
    if (complete) void this.completeLesson(lesson, 'auto');
  }

  /**
   * Persists a lesson completion (manual CTA or auto): optimistic local
   * update first, rolled back with an inline error toast if the Firestore
   * write fails. First-attempt knowledge-check results ride along so the
   * enrollment records a real score.
   */
  private async completeLesson(lesson: LessonDraft, trigger: 'auto' | 'manual'): Promise<void> {
    const course = this.course();
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!course || !tenantId || !uid || this.saving() || this.isCompleted(lesson.id)) return;

    const collected = Object.values(this.checkResults()[lesson.id] ?? {});
    const knowledgeCheckResults = collected.length > 0 ? collected : undefined;

    const previous = this.enrollment();
    const optimistic = nextEnrollment({
      tenantId,
      uid,
      course,
      lessonId: lesson.id,
      existing: previous,
      knowledgeCheckResults,
    });
    this.saveError.set(null);
    this.enrollment.set(optimistic);
    this.justCompletedId.set(lesson.id);
    if (trigger === 'auto') this.showCompletionToast();
    if (optimistic.completed && !previous?.completed) this.celebrating.set(true);

    this.saving.set(true);
    try {
      const persisted = await this.enrollments.markLessonComplete(this.db, {
        tenantId,
        uid,
        course,
        lessonId: lesson.id,
        existing: previous,
        knowledgeCheckResults,
      });
      this.enrollment.set(persisted);
    } catch (error) {
      console.error('[learner] failed to save lesson completion', error);
      this.enrollment.set(previous);
      this.celebrating.set(false);
      this.completionToast.set(false);
      this.justCompletedId.set(null);
      this.saveError.set('Could not save your progress — check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  private showCompletionToast(): void {
    this.completionToast.set(true);
    clearTimeout(this.toastTimer);
    // Outside the zone so a pending dismiss timer never blocks stability;
    // the signal write still schedules change detection.
    this.zone.runOutsideAngular(() => {
      this.toastTimer = setTimeout(() => this.completionToast.set(false), 2500);
    });
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
