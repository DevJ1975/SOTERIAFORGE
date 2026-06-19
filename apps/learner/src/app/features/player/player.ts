import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { getDoc } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { PrincipalStore } from '@forge/auth';
import { FIRESTORE, memberDoc } from '@forge/data-access';
import {
  CourseCatalogService,
  CourseContentService,
  EnrollmentService,
  ForgeLessonRenderer,
  ProgressService,
} from '@forge/lms-core';
import { courseCompletionXp, levelForXp, levelProgress } from '@forge/gamification';
import type { Course, CourseDraft, Enrollment, LessonDraft } from '@forge/shared';

interface CompletionProjection {
  awardedXp: number;
  /** Absolute projected level, or undefined when the member baseline is unknown. */
  level?: number;
  /** Fraction toward the next level, or undefined without a baseline. */
  pct?: number;
}

/**
 * Course player: renders a CourseDraft's lessons with the shared lesson
 * renderer, tracks per-lesson completion, and projects a celebratory
 * XP/level/badge summary on completion (without writing the member doc).
 */
@Component({
  selector: 'app-player',
  imports: [RouterLink, ButtonModule, ProgressBarModule, ForgeLessonRenderer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      @if (loading()) {
        <p class="muted">Loading course…</p>
      } @else if (error()) {
        <div class="forge-card empty error-card">
          <h2>Couldn't load this course</h2>
          <p class="muted">Something went wrong reaching the training service. Please try again.</p>
          <p-button label="Retry" icon="pi pi-refresh" (onClick)="retry()" />
        </div>
      } @else if (!content()) {
        <div class="forge-card empty">
          <h2>Course unavailable</h2>
          <p class="muted">This course has no published content yet.</p>
          <p-button label="Back to catalog" routerLink="/courses" severity="secondary" />
        </div>
      } @else {
        <header class="player-head forge-card">
          <div>
            <a routerLink="/courses" class="back-link">&larr; Catalog</a>
            <h1>{{ content()!.title }}</h1>
          </div>
          <div class="head-progress">
            <span>{{ completedCount() }} / {{ lessons().length }} lessons</span>
            <p-progressBar
              [value]="progressPct()"
              [showValue]="false"
              [attr.aria-label]="'Course progress'"
              [attr.aria-valuetext]="progressPct() + '% complete'"
            />
          </div>
        </header>

        <div class="player-body">
          <nav class="lesson-nav forge-card" aria-label="Lessons">
            <ol>
              @for (lesson of lessons(); track lesson.id; let i = $index) {
                <li>
                  <button
                    type="button"
                    class="nav-item"
                    [class.active]="i === activeIndex()"
                    [class.done]="isComplete(lesson.id)"
                    [attr.aria-current]="i === activeIndex() ? 'step' : null"
                    (click)="goTo(i)"
                  >
                    <span class="nav-marker" aria-hidden="true"></span>
                    <span class="nav-text">{{ lesson.title }}</span>
                  </button>
                </li>
              }
            </ol>
          </nav>

          <section class="lesson-pane forge-card">
            @if (activeLesson(); as lesson) {
              <forge-lesson-renderer [lesson]="lesson" />
              <footer class="lesson-foot">
                <p-button
                  label="Previous"
                  severity="secondary"
                  [disabled]="activeIndex() === 0"
                  (onClick)="prev()"
                />
                @if (enrollment()?.completed) {
                  <span class="completed-state">&#10003; Completed — Review</span>
                } @else if (!isComplete(activeLesson()!.id)) {
                  <p-button label="Mark lesson done" (onClick)="markDone()" />
                } @else if (!isLastLesson()) {
                  <p-button label="Next lesson" (onClick)="next()" />
                } @else if (allLessonsDone()) {
                  <p-button label="Complete course" icon="pi pi-flag" (onClick)="complete()" />
                }
              </footer>
            }
          </section>
        </div>

        @if (projection(); as p) {
          <div
            #celebration
            class="celebrate forge-card"
            tabindex="-1"
            role="status"
            aria-live="polite"
          >
            <span class="confetti" aria-hidden="true">&#127881;</span>
            <h2>Course complete!</h2>
            @if (p.level !== undefined) {
              <p class="muted">
                <strong>+{{ p.awardedXp }} XP</strong> &rarr; Level
                <strong>{{ p.level }}</strong> ({{ projectedPctLabel() }} to next).
              </p>
            } @else {
              <p class="muted">
                <strong>+{{ p.awardedXp }} XP</strong> earned.
              </p>
            }
            <p class="fine-print">
              XP and level shown are a projection over your current total and are not yet saved.
              Live XP, levels, and badges are awarded by the platform when the rewards service runs
              (Phase 4).
            </p>
            <p-button label="Back to My Learning" routerLink="/my-learning" />
          </div>
        }
      }
    </div>
  `,
  styles: `
    .muted {
      color: var(--forge-text-subtle);
    }
    .empty {
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: center;
    }
    .player-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .player-head h1 {
      margin: 8px 0 0;
    }
    .back-link {
      color: var(--forge-accent);
      text-decoration: none;
      font-size: 0.9rem;
    }
    .head-progress {
      min-width: 240px;
      flex: 1;
      max-width: 360px;
    }
    .head-progress span {
      display: block;
      color: var(--forge-text-subtle);
      font-size: 0.85rem;
      margin-bottom: 6px;
    }
    .player-body {
      display: grid;
      grid-template-columns: minmax(220px, 280px) 1fr;
      gap: 24px;
      align-items: start;
    }
    @media (max-width: 820px) {
      .player-body {
        grid-template-columns: 1fr;
      }
    }
    .lesson-nav ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      text-align: left;
      background: none;
      border: none;
      padding: 10px 12px;
      border-radius: var(--forge-radius-small);
      cursor: pointer;
      color: var(--forge-text);
      font: inherit;
    }
    .nav-item:hover {
      background: var(--forge-surface-dim);
    }
    .nav-item.active {
      background: var(--forge-surface-dim);
      font-weight: 600;
    }
    .nav-marker {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid var(--forge-border);
      flex-shrink: 0;
    }
    .nav-item.done .nav-marker {
      background: var(--forge-positive);
      border-color: var(--forge-positive);
    }
    .nav-item.active .nav-marker {
      border-color: var(--forge-accent);
    }
    .lesson-foot {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid var(--forge-border);
    }
    .completed-state {
      color: var(--forge-positive);
      font-weight: 600;
      align-self: center;
    }
    .error-card {
      border: 1px solid var(--forge-negative);
    }
    .celebrate {
      margin-top: 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      border: 1px solid var(--forge-accent);
    }
    .confetti {
      font-size: 3rem;
    }
    .fine-print {
      color: var(--forge-text-subtle);
      font-size: 0.8rem;
      max-width: 52ch;
    }
  `,
})
export class Player {
  private readonly route = inject(ActivatedRoute);
  private readonly db = inject(FIRESTORE);
  private readonly contentService = inject(CourseContentService);
  private readonly catalog = inject(CourseCatalogService);
  private readonly enrollments = inject(EnrollmentService);
  private readonly progress = inject(ProgressService);
  private readonly principal = inject(PrincipalStore);

  private readonly courseId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('courseId') ?? '')),
    { initialValue: '' },
  );

  private readonly celebration = viewChild<ElementRef<HTMLElement>>('celebration');

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly content = signal<CourseDraft | undefined>(undefined);
  protected readonly course = signal<Course | undefined>(undefined);
  protected readonly enrollment = signal<Enrollment | undefined>(undefined);
  protected readonly activeIndex = signal(0);
  private readonly completed = signal<Set<string>>(new Set());
  /** The learner's current (seeded) XP baseline; undefined if the member doc can't load. */
  private readonly memberXp = signal<number | undefined>(undefined);
  protected readonly projection = signal<CompletionProjection | undefined>(undefined);

  protected readonly lessons = computed<LessonDraft[]>(() => this.content()?.lessons ?? []);
  protected readonly activeLesson = computed(() => this.lessons()[this.activeIndex()]);
  protected readonly completedCount = computed(() => this.completed().size);
  protected readonly progressPct = computed(() => {
    const total = this.lessons().length;
    return total > 0 ? Math.round((this.completed().size / total) * 100) : 0;
  });
  /** Every lesson marked done — the gate for showing the "Complete course" CTA. */
  protected readonly allLessonsDone = computed(
    () => this.lessons().length > 0 && this.progressPct() === 100,
  );

  private lastCourseId = '';

  constructor() {
    // Drive (re)loading off the route param so navigating course a -> course b
    // reuses this component but still refetches instead of showing stale state.
    effect(() => void this.maybeLoad(this.courseId()));
  }

  private async maybeLoad(id: string): Promise<void> {
    if (!id || id === this.lastCourseId) return;
    this.lastCourseId = id;
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    // Reset per-course view state so a reused component never shows stale data.
    this.activeIndex.set(0);
    this.completed.set(new Set());
    this.projection.set(undefined);
    try {
      const [content, course, enrollment, memberSnap] = await Promise.all([
        this.contentService.getContent(tenantId, id),
        this.catalog.get(tenantId, id),
        this.enrollments.getEnrollment(tenantId, id, uid),
        getDoc(memberDoc(this.db, tenantId, uid)),
      ]);
      this.content.set(content);
      this.course.set(course);
      this.enrollment.set(enrollment);
      this.memberXp.set(memberSnap.exists() ? memberSnap.data().xp : undefined);
      // Seed completion: if the enrollment is finished, treat all lessons done.
      if (enrollment?.completed && content) {
        this.completed.set(new Set(content.lessons.map((l) => l.id)));
      }
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected retry(): void {
    this.lastCourseId = '';
    void this.maybeLoad(this.courseId());
  }

  protected isComplete(lessonId: string): boolean {
    return this.completed().has(lessonId);
  }

  protected isLastLesson(): boolean {
    return this.activeIndex() === this.lessons().length - 1;
  }

  protected goTo(index: number): void {
    this.activeIndex.set(index);
  }

  protected next(): void {
    if (!this.isLastLesson()) this.activeIndex.update((i) => i + 1);
  }

  protected prev(): void {
    if (this.activeIndex() > 0) this.activeIndex.update((i) => i - 1);
  }

  protected async markDone(): Promise<void> {
    const lesson = this.activeLesson();
    if (!lesson) return;
    const next = new Set(this.completed());
    next.add(lesson.id);
    this.completed.set(next);
    await this.persistProgress(next);
    if (!this.isLastLesson()) this.next();
  }

  protected async complete(): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) return;
    const courseId = this.courseId();
    const enrollment = await this.progress.completeCourse(tenantId, courseId, uid);
    this.enrollment.set(enrollment);
    this.showCelebration();
  }

  private async persistProgress(completed: Set<string>): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) return;
    const enrollment = await this.progress.setLessonProgress(
      tenantId,
      this.courseId(),
      uid,
      [...completed],
      this.lessons().length,
    );
    this.enrollment.set(enrollment);
  }

  private showCelebration(): void {
    const awardedXp = courseCompletionXp({ xpReward: this.course()?.xpReward });
    const baseline = this.memberXp();
    if (baseline === undefined) {
      // No member baseline available — show the award honestly without claiming
      // an absolute level we can't compute.
      this.projection.set({ awardedXp });
    } else {
      // Project over the learner's actual (seeded) XP so the level shown is
      // honest, not the level the course award would imply in isolation.
      const projectedXp = baseline + awardedXp;
      const level = levelForXp(projectedXp);
      const { pct } = levelProgress(projectedXp);
      this.projection.set({ awardedXp, level, pct });
    }
    // Move focus to the celebration so screen readers (and keyboard users)
    // land on the announced result.
    queueMicrotask(() => this.celebration()?.nativeElement.focus());
  }

  protected projectedPctLabel(): string {
    const pct = this.projection()?.pct;
    if (pct === undefined) return '';
    return `${Math.round(pct * 100)}%`;
  }
}
