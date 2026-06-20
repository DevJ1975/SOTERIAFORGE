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
  OFFLINE_VIDEO_PORT,
} from '@forge/lms-core';
import { courseCompletionXp, levelForXp, levelProgress } from '@forge/gamification';
import type { Course, CourseDraft, Enrollment, LessonDraft, VideoBlock } from '@forge/shared';
import { NetworkStatusService } from '../../offline/network-status.service';
import { ProgressSyncQueue } from '../../offline/progress-sync-queue.service';

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
            @if (uploadedVideoCount() > 0) {
              <p class="offline-affordance">
                @if (offlineSupported()) {
                  @if (offlineReadyCount() === uploadedVideoCount()) {
                    <span class="offline-chip ready" role="status">
                      <span class="offline-dot" aria-hidden="true"></span> Available offline
                    </span>
                  } @else if (offlineReadyCount() > 0) {
                    <span class="offline-chip partial" role="status">
                      {{ offlineReadyCount() }} of {{ uploadedVideoCount() }} videos saved offline
                    </span>
                  } @else {
                    <span class="offline-chip" role="status">
                      Download videos in a lesson for offline viewing
                    </span>
                  }
                  <a routerLink="/downloads" class="manage-link">Manage downloads</a>
                } @else if (!networkOnline()) {
                  <span class="offline-chip warn" role="status">
                    You're offline — uploaded videos need a connection on the web
                  </span>
                }
              </p>
            }
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
            <div class="celebrate-actions">
              @if (enrollment()?.completed) {
                <p-button
                  label="View certificate"
                  icon="pi pi-verified"
                  [routerLink]="['/certificate', courseId()]"
                />
              }
              <p-button
                label="Back to My Learning"
                severity="secondary"
                routerLink="/my-learning"
              />
            </div>
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
    .offline-affordance {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      margin: 10px 0 0;
    }
    .offline-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--forge-surface-dim);
      border: 1px solid var(--forge-border);
      font-size: 0.8rem;
      color: var(--forge-text-subtle);
    }
    .offline-chip.ready {
      color: var(--forge-positive);
      border-color: var(--forge-positive);
    }
    .offline-chip.partial {
      color: var(--forge-notice);
      border-color: var(--forge-notice);
    }
    .offline-chip.warn {
      color: var(--forge-notice);
      border-color: var(--forge-notice);
    }
    .offline-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--forge-positive);
    }
    .manage-link {
      color: var(--forge-accent);
      text-decoration: none;
      font-size: 0.8rem;
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
    .celebrate-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 8px;
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
  private readonly principal = inject(PrincipalStore);
  // Optional so the player still works in the admin preview / tests where no
  // offline port is provided.
  private readonly offlinePort = inject(OFFLINE_VIDEO_PORT, { optional: true });
  private readonly network = inject(NetworkStatusService);
  // Durable, replay-safe outbox: progress is enqueued (never lost offline) and
  // flushed opportunistically. See ProgressSyncQueue.
  private readonly queue = inject(ProgressSyncQueue);

  protected readonly courseId = toSignal(
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

  // ---- Offline video affordance -------------------------------------------
  protected readonly networkOnline = this.network.online;
  protected readonly offlineSupported = signal(this.offlinePort?.supported() ?? false);
  /** Downloaded count among this course's uploaded (offline-capable) videos. */
  protected readonly offlineReadyCount = signal(0);
  /** Uploaded (offline-capable) video blocks across the course's lessons. */
  protected readonly uploadedVideos = computed<VideoBlock[]>(() =>
    this.lessons()
      .flatMap((lesson) => lesson.blocks)
      .filter((b): b is VideoBlock => b.kind === 'video' && !!b.storagePath),
  );
  protected readonly uploadedVideoCount = computed(() => this.uploadedVideos().length);

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
      void this.refreshOfflineState();
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

  /**
   * Recompute how many of this course's uploaded videos are saved offline, so
   * the player header can show an "Available offline" affordance. Best-effort:
   * any failure (or no port) simply shows zero ready downloads.
   */
  private async refreshOfflineState(): Promise<void> {
    this.offlineSupported.set(this.offlinePort?.supported() ?? false);
    const port = this.offlinePort;
    const videos = this.uploadedVideos();
    if (!port || !port.supported() || videos.length === 0) {
      this.offlineReadyCount.set(0);
      return;
    }
    try {
      const flags = await Promise.all(
        videos.map((v) => port.isDownloaded(v.storagePath as string)),
      );
      this.offlineReadyCount.set(flags.filter(Boolean).length);
    } catch {
      this.offlineReadyCount.set(0);
    }
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
    await this.persistProgress(next, lesson.id);
    if (!this.isLastLesson()) this.next();
  }

  protected async complete(): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) return;
    const courseId = this.courseId();
    // Optimistically mark the enrollment complete so the UX (celebration,
    // completed state) is immediate; the durable event carries the real write.
    this.enrollment.update((current) =>
      this.optimisticEnrollment(current, {
        uid,
        courseId,
        tenantId,
        progressPct: 100,
        completed: true,
      }),
    );
    // Enqueue the course-completed event, then opportunistically flush. Offline,
    // it stays durably queued; we never throw to the UI, so the learner always
    // sees their completion celebration.
    await this.queue.enqueue({ uid, tenantId, courseId, kind: 'course_completed' });
    void this.queue.flush();
    this.showCelebration();
  }

  private async persistProgress(completed: Set<string>, lessonId: string): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) return;
    const courseId = this.courseId();
    // Optimistically advance local progress so the UI updates instantly, even
    // offline. Never auto-completes — that's reserved for complete().
    const total = this.lessons().length;
    const progressPct = total > 0 ? Math.min(100, Math.round((completed.size / total) * 100)) : 0;
    this.enrollment.update((current) =>
      this.optimisticEnrollment(current, { uid, courseId, tenantId, progressPct }),
    );
    // Append a durable lesson-completed event; flush opportunistically. Offline
    // it stays queued (no lost progress) and never throws to the UI.
    await this.queue.enqueue({ uid, tenantId, courseId, kind: 'lesson_completed', lessonId });
    void this.queue.flush();
  }

  /**
   * Merge an optimistic patch onto the current enrollment, synthesising a
   * complete `Enrollment` (with sane defaults) when none has loaded yet. This
   * keeps the player UX instant while the durable queue performs the real,
   * server-derived write asynchronously.
   */
  private optimisticEnrollment(
    current: Enrollment | undefined,
    patch: Partial<Enrollment> & Pick<Enrollment, 'uid' | 'courseId' | 'tenantId'>,
  ): Enrollment {
    const base: Enrollment = current ?? {
      uid: patch.uid,
      courseId: patch.courseId,
      tenantId: patch.tenantId,
      progressPct: 0,
      completed: false,
      progressVersion: 0,
      completedLessonIds: [],
      attemptCount: 0,
      createdAt: new Date().toISOString(),
    };
    return { ...base, ...patch };
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
