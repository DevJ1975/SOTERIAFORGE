import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ModulePlayerComponent, DownloadService, formatBytes } from '@assurance/player';
import { ModuleRepository, EnrollmentRepository, CourseRepository } from '@assurance/data-access';
import { EnrollmentService } from '@assurance/lms-core';
import { AuthService, TenantService } from '@assurance/auth';
import { TutorChatComponent } from '@assurance/ai-tutor';
import type { Module, Enrollment, Course } from '@assurance/shared';

@Component({
  selector: 'assurance-learner-course-detail',
  standalone: true,
  imports: [RouterLink, CardModule, ModulePlayerComponent, TutorChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="course-detail" aria-labelledby="course-detail-heading">
      <nav class="course-detail__nav" aria-label="Course navigation">
        <a routerLink="/courses">← Back to Courses</a>
      </nav>

      <h1 id="course-detail-heading" class="course-detail__title">Course: {{ id() }}</h1>

      <!-- Microlearning meta (MO-14): total estimated time + focused-mode toggle. -->
      @if (!loading() && modules().length > 0) {
        <div class="course-detail__meta">
          @if (totalEstimatedMinutes() > 0) {
            <span class="course-detail__total-time">
              ⏱ Total: {{ totalEstimatedMinutes() }} min
            </span>
          }
          <button
            type="button"
            class="course-detail__mode-toggle"
            [attr.aria-pressed]="stepped()"
            (click)="toggleStepped()"
          >
            {{ stepped() ? 'Exit focused mode' : 'Focused mode' }}
          </button>
        </div>
      }

      @if (course()?.availableOffline) {
        <div
          class="course-detail__download"
          role="group"
          aria-label="Offline download for this course"
        >
          @if (isDownloaded()) {
            <span class="course-detail__download-status">
              Downloaded for offline
              @if (downloadedSize()) {
                · {{ downloadedSize() }}
              }
            </span>
            <button
              type="button"
              class="course-detail__download-btn course-detail__download-btn--remove"
              (click)="removeDownload()"
              [disabled]="downloading()"
            >
              Remove download
            </button>
          } @else {
            <button
              type="button"
              class="course-detail__download-btn"
              (click)="downloadCourse()"
              [disabled]="downloading() || cacheableCount() === 0"
              [attr.aria-busy]="downloading()"
            >
              @if (downloading()) {
                Downloading…
              } @else {
                Download for offline
              }
            </button>
            @if (cacheableCount() === 0) {
              <span class="course-detail__download-note" role="note">
                No downloadable content (all modules require a connection).
              </span>
            }
          }
          @if (downloadError()) {
            <p class="course-detail__download-error" role="alert">{{ downloadError() }}</p>
          }
        </div>
      }

      @if (loading()) {
        <p class="course-detail__status">Loading…</p>
      } @else if (stepped() && modules().length > 0) {
        <!-- Microlearning stepped mode (MO-14): one module per screen. -->
        <div class="course-detail__step" role="region" aria-label="Focused module view">
          <!-- Progress: dots + "N of M" -->
          <div class="course-detail__step-progress">
            <ol class="course-detail__step-dots" aria-hidden="true">
              @for (mod of modules(); track mod.id; let i = $index) {
                <li
                  class="course-detail__step-dot"
                  [class.course-detail__step-dot--active]="i === stepIndex()"
                  [class.course-detail__step-dot--done]="isComplete(mod.id)"
                ></li>
              }
            </ol>
            <span class="course-detail__step-count" aria-live="polite">
              {{ stepIndex() + 1 }} of {{ stepCount() }}
            </span>
          </div>

          @if (currentStepModule(); as mod) {
            <h2 class="course-detail__step-title">
              {{ mod.title }}
              @if (estimatedLabel(mod); as label) {
                <span class="course-detail__step-duration">· {{ label }}</span>
              }
            </h2>
            <div role="region" aria-label="Module player" class="course-detail__step-player">
              @if (uid() && tenantId()) {
                <assurance-module-player
                  [module]="mod"
                  [courseId]="id()"
                  [tenantId]="tenantId()!"
                  [uid]="uid()!"
                />
              }
            </div>
          }

          <!-- Large (>=44px) Back / Next controls -->
          <div class="course-detail__step-controls">
            <button
              type="button"
              class="course-detail__step-btn course-detail__step-btn--back"
              (click)="prevStep()"
              [disabled]="isFirstStep()"
            >
              ← Back
            </button>
            @if (!isLastStep()) {
              <button
                type="button"
                class="course-detail__step-btn course-detail__step-btn--next"
                (click)="nextStep()"
              >
                Continue →
              </button>
            } @else {
              <button
                type="button"
                class="course-detail__step-btn course-detail__step-btn--next"
                (click)="toggleStepped()"
              >
                Finish
              </button>
            }
          </div>
        </div>
      } @else {
        <div class="course-detail__layout">
          <!-- Module list sidebar -->
          <aside class="course-detail__sidebar" aria-labelledby="modules-heading">
            <h2 id="modules-heading">Modules</h2>
            @if (modules().length === 0) {
              <p>No modules available.</p>
            } @else {
              <ul class="course-detail__module-list">
                @for (mod of modules(); track mod.id) {
                  <li
                    class="course-detail__module-item"
                    [class.course-detail__module-item--active]="selectedModule()?.id === mod.id"
                    [class.course-detail__module-item--done]="isComplete(mod.id)"
                  >
                    <button
                      type="button"
                      class="course-detail__module-btn"
                      (click)="selectModule(mod)"
                    >
                      {{ mod.title }}
                      <span class="course-detail__module-meta">
                        @if (estimatedLabel(mod); as label) {
                          <span class="course-detail__module-duration" aria-label="Estimated time">
                            {{ label }}
                          </span>
                        }
                        @if (requiresConnection(mod.id)) {
                          <span
                            class="course-detail__conn-badge"
                            role="note"
                            aria-label="Requires connection"
                            title="Streams from an external host (e.g. YouTube/Vimeo) and cannot be downloaded for offline use"
                          >
                            Requires connection
                          </span>
                        }
                        @if (isComplete(mod.id)) {
                          <span class="course-detail__badge" aria-label="Completed">✓</span>
                        }
                      </span>
                    </button>
                  </li>
                }
              </ul>
            }
            <div class="course-detail__progress">Progress: {{ progressPct() }}%</div>
          </aside>

          <!-- Player area -->
          <div role="region" aria-label="Module player" class="course-detail__player">
            @if (selectedModule(); as mod) {
              @if (uid() && tenantId()) {
                <assurance-module-player
                  [module]="mod"
                  [courseId]="id()"
                  [tenantId]="tenantId()!"
                  [uid]="uid()!"
                />
              }
            } @else {
              <p-card header="Select a module">
                <p>Choose a module from the list to begin.</p>
              </p-card>
            }
          </div>
        </div>

        @if (tenantId() && uid()) {
          <div class="course-detail__tutor">
            <details class="course-detail__tutor-panel">
              <summary
                class="course-detail__tutor-summary"
                aria-label="Ask the AI Tutor – toggle panel"
              >
                Ask the AI Tutor
              </summary>
              <div class="course-detail__tutor-chat" role="region" aria-label="AI Tutor chat">
                <assurance-tutor-chat [tenantId]="tenantId()!" [uid]="uid()!" />
              </div>
            </details>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      .course-detail {
        max-width: 80rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .course-detail__nav {
        margin-bottom: 1rem;
      }
      .course-detail__nav a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: var(--assurance-primary, #0b5fff);
        text-decoration: none;
      }
      .course-detail__status {
        color: var(--assurance-text-muted, #666);
      }
      .course-detail__download {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin: 0 0 1rem;
      }
      .course-detail__download-status {
        font-size: 0.875rem;
        color: var(--assurance-success, #15803d);
        font-weight: 600;
      }
      .course-detail__download-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0.5rem 1rem;
        border: 1px solid var(--assurance-primary, #0b5fff);
        border-radius: 0.5rem;
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
        font-size: 0.875rem;
        cursor: pointer;
      }
      .course-detail__download-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .course-detail__download-btn--remove {
        background: none;
        color: var(--assurance-primary, #0b5fff);
      }
      .course-detail__download-note,
      .course-detail__download-error {
        font-size: 0.8125rem;
        color: var(--assurance-text-muted, #666);
        margin: 0;
      }
      .course-detail__download-error {
        color: #b00020;
        flex-basis: 100%;
      }
      .course-detail__module-meta {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        margin-left: 0.5rem;
      }
      .course-detail__conn-badge {
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1;
        padding: 0.2rem 0.4rem;
        border-radius: 0.25rem;
        background: var(--assurance-warning-bg, #fef3c7);
        color: var(--assurance-warning-text, #92400e);
        white-space: nowrap;
      }
      .course-detail__layout {
        display: grid;
        /* Phones: single column — player full-width above a stacked module list
           (no horizontal scroll at 320/375px). The fixed 16rem sidebar only
           applies once there is room for it. */
        grid-template-columns: 1fr;
        gap: 1.5rem;
      }
      @media (min-width: 48rem) {
        .course-detail__layout {
          grid-template-columns: 16rem 1fr;
        }
      }
      .course-detail__module-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .course-detail__module-item {
        border-bottom: 1px solid var(--assurance-border, #e5e7eb);
      }
      .course-detail__module-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        /* >= 44px touch target. */
        min-height: 44px;
        padding: 0.625rem 0.5rem;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        font-size: 0.875rem;
      }
      .course-detail__module-item--active .course-detail__module-btn {
        color: var(--assurance-primary, #0b5fff);
        font-weight: 600;
      }
      .course-detail__module-item--done .course-detail__module-btn {
        color: var(--assurance-success, #22c55e);
      }
      .course-detail__badge {
        margin-left: 0.5rem;
        font-weight: 700;
      }
      .course-detail__progress {
        margin-top: 1rem;
        font-size: 0.875rem;
        color: var(--assurance-text-muted, #666);
      }
      /* Microlearning meta + per-module duration (MO-14). */
      .course-detail__meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin: 0 0 1rem;
      }
      .course-detail__total-time {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--assurance-text-muted, #666);
      }
      .course-detail__mode-toggle {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0.5rem 1rem;
        border: 1px solid var(--assurance-primary, #0b5fff);
        border-radius: 0.5rem;
        background: none;
        color: var(--assurance-primary, #0b5fff);
        font-size: 0.875rem;
        cursor: pointer;
      }
      .course-detail__mode-toggle[aria-pressed='true'] {
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
      }
      .course-detail__module-duration {
        font-size: 0.6875rem;
        font-weight: 600;
        line-height: 1;
        padding: 0.2rem 0.4rem;
        border-radius: 0.25rem;
        background: var(--surface-100, #f1f5f9);
        color: var(--assurance-text-muted, #475569);
        white-space: nowrap;
      }
      /* Stepped / focused one-module-per-screen view (MO-14). */
      .course-detail__step {
        max-width: 44rem;
        margin: 0 auto;
      }
      .course-detail__step-progress {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }
      .course-detail__step-dots {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        list-style: none;
        padding: 0;
        margin: 0;
      }
      .course-detail__step-dot {
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 50%;
        background: var(--assurance-border, #d1d5db);
      }
      .course-detail__step-dot--active {
        background: var(--assurance-primary, #0b5fff);
        transform: scale(1.2);
      }
      .course-detail__step-dot--done {
        background: var(--assurance-success, #22c55e);
      }
      .course-detail__step-count {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--assurance-text-muted, #666);
        white-space: nowrap;
      }
      .course-detail__step-title {
        font-size: clamp(1.1rem, 4vw, 1.5rem);
        line-height: 1.2;
        margin: 0 0 1rem;
      }
      .course-detail__step-duration {
        font-size: 0.875rem;
        font-weight: 400;
        color: var(--assurance-text-muted, #666);
      }
      .course-detail__step-player {
        min-height: 18rem;
        margin-bottom: 1.5rem;
      }
      .course-detail__step-controls {
        display: flex;
        gap: 0.75rem;
        justify-content: space-between;
      }
      .course-detail__step-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        /* Large touch targets. */
        min-height: 48px;
        min-width: 44px;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
      }
      .course-detail__step-btn--back {
        border: 1px solid var(--assurance-border, #d1d5db);
        background: none;
        color: var(--assurance-text, #1a1a1a);
      }
      .course-detail__step-btn--back:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .course-detail__step-btn--next {
        border: none;
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
        /* Larger primary action. */
        flex: 1 1 auto;
        max-width: 16rem;
      }
      .course-detail__player {
        min-height: 20rem;
        /* Phones: show the player above the stacked module list. */
        order: -1;
      }
      @media (min-width: 48rem) {
        .course-detail__player {
          order: 0;
        }
      }
      .course-detail__tutor {
        margin-top: 1.5rem;
      }
      .course-detail__tutor-panel {
        border: 1px solid var(--assurance-border, #e5e7eb);
        border-radius: 0.5rem;
        overflow: hidden;
      }
      .course-detail__tutor-summary {
        padding: 0.75rem 1rem;
        font-weight: 600;
        cursor: pointer;
        background: var(--surface-50, #f9fafb);
        list-style: none;
        user-select: none;
      }
      .course-detail__tutor-summary::-webkit-details-marker {
        display: none;
      }
      .course-detail__tutor-chat {
        height: 24rem;
      }
    `,
  ],
})
export class CourseDetailComponent implements OnInit {
  /** Route param — populated via withComponentInputBinding in app.config.ts. */
  readonly id = input.required<string>();

  private readonly moduleRepo = inject(ModuleRepository);
  private readonly enrollmentRepo = inject(EnrollmentRepository);
  private readonly courseRepo = inject(CourseRepository);
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly auth = inject(AuthService);
  private readonly tenantSvc = inject(TenantService);
  private readonly downloadSvc = inject(DownloadService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly modules = signal<Module[]>([]);
  protected readonly selectedModule = signal<Module | null>(null);
  protected readonly loading = signal(true);
  protected readonly course = signal<Course | null>(null);

  // Microlearning (MO-14): stepped one-module-per-screen mode.
  /** When true, present one module per screen with Back/Next + progress. */
  protected readonly stepped = signal(false);
  /** Index of the module shown in stepped mode. */
  protected readonly stepIndex = signal(0);
  /** Total modules (for "N of M"). */
  protected readonly stepCount = computed(() => this.modules().length);
  protected readonly currentStepModule = computed(() => this.modules()[this.stepIndex()] ?? null);
  protected readonly isFirstStep = computed(() => this.stepIndex() === 0);
  protected readonly isLastStep = computed(
    () => this.stepIndex() >= Math.max(0, this.modules().length - 1),
  );

  /** Course-level total estimated time (MO-14): sum of per-module minutes. */
  protected readonly totalEstimatedMinutes = computed(() =>
    this.modules().reduce((sum, m) => sum + (m.estimatedMinutes ?? 0), 0),
  );

  // Offline download state (MO-07)
  protected readonly downloading = signal(false);
  protected readonly downloadError = signal<string | null>(null);
  /** Module ids that stream from external hosts (YouTube/Vimeo) — not cacheable. */
  private readonly connectionOnlyIds = computed(
    () =>
      new Set(
        this.downloadSvc.analyzeCacheability(this.modules()).requiresConnection.map((m) => m.id),
      ),
  );
  protected readonly cacheableCount = computed(
    () => this.downloadSvc.analyzeCacheability(this.modules()).cacheable.length,
  );
  /** Reactive downloaded state for this course (from DownloadService's map). */
  protected readonly isDownloaded = computed(
    () => this.downloadSvc.downloads()[this.id()]?.downloaded ?? false,
  );
  protected readonly downloadedSize = computed(() => {
    const bytes = this.downloadSvc.downloads()[this.id()]?.totalBytes;
    return bytes ? formatBytes(bytes) : null;
  });

  protected requiresConnection(moduleId: string): boolean {
    return this.connectionOnlyIds().has(moduleId);
  }

  // These are typed to handle null TenantService values
  protected readonly tenantId = computed(() => this.tenantSvc.tenantId() ?? null);
  protected readonly uid = computed(() => this.auth.principal()?.uid ?? null);

  /** Live enrollment state; fed by a watch() subscription scoped to the component. */
  private readonly enrollment = signal<Enrollment | null | undefined>(undefined);

  protected readonly progressPct = computed(() => this.enrollment()?.progressPct ?? 0);

  protected isComplete(moduleId: string): boolean {
    const e = this.enrollment();
    if (!e) return false;
    const ids = e.cmi?.['completedModuleIds'];
    if (Array.isArray(ids)) {
      return ids.includes(moduleId);
    }
    return e.completed ?? false;
  }

  async ngOnInit(): Promise<void> {
    const tenantId = this.tenantId();
    const uid = this.uid();
    const courseId = this.id();

    if (!tenantId || !uid || !courseId) {
      this.loading.set(false);
      return;
    }

    try {
      // Load course (for the availableOffline flag) and modules.
      const course = await this.courseRepo.getById(tenantId, courseId).catch(() => null);
      this.course.set(course ?? null);

      const mods = await this.moduleRepo.listOrdered(tenantId, courseId);
      this.modules.set(mods);

      // Reflect any prior download for this course in the reactive state.
      void this.downloadSvc.getManifest(tenantId, courseId);

      // Auto-select first module
      if (mods.length > 0) {
        this.selectedModule.set(mods[0]);
      }

      // Check enrollment; auto-enroll if none found
      const existing = await this.enrollmentRepo.get(tenantId, courseId, uid);
      if (!existing) {
        const newEnrollment = await this.enrollmentService.enroll(tenantId, courseId, uid);
        this.enrollment.set(newEnrollment);
      } else {
        this.enrollment.set(existing);
      }

      // Subscribe to live enrollment updates; auto-unsubscribe on destroy so the
      // Firestore listener doesn't leak on navigation away.
      this.enrollmentRepo
        .watch(tenantId, courseId, uid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((e) => {
          if (e !== undefined) {
            this.enrollment.set(e);
          }
        });
    } catch (err) {
      console.error('[CourseDetailComponent] Failed to load course data', err);
    } finally {
      this.loading.set(false);
    }
  }

  selectModule(mod: Module): void {
    this.selectedModule.set(mod);
    // Keep the stepped index in sync if the learner picks from the list.
    const idx = this.modules().findIndex((m) => m.id === mod.id);
    if (idx >= 0) this.stepIndex.set(idx);
  }

  /** Human label for a module's estimated duration, or null when unset (MO-14). */
  protected estimatedLabel(mod: Module): string | null {
    const mins = mod.estimatedMinutes;
    if (mins == null) return null;
    return mins === 1 ? '1 min' : `${mins} min`;
  }

  /** Toggle the stepped/focused one-module-per-screen mode (MO-14). */
  protected toggleStepped(): void {
    this.stepped.update((v) => !v);
    // Entering stepped mode: start at the currently selected module if any.
    if (this.stepped()) {
      const sel = this.selectedModule();
      const idx = sel ? this.modules().findIndex((m) => m.id === sel.id) : 0;
      this.stepIndex.set(idx >= 0 ? idx : 0);
      this.syncStepSelection();
    }
  }

  protected nextStep(): void {
    if (this.isLastStep()) return;
    this.stepIndex.update((i) => i + 1);
    this.syncStepSelection();
  }

  protected prevStep(): void {
    if (this.isFirstStep()) return;
    this.stepIndex.update((i) => i - 1);
    this.syncStepSelection();
  }

  /** Keep the selected module (the one the player renders) aligned to the step. */
  private syncStepSelection(): void {
    const mod = this.modules()[this.stepIndex()];
    if (mod) this.selectedModule.set(mod);
  }

  /** Download this course's cacheable content for offline use (MO-07). */
  protected async downloadCourse(): Promise<void> {
    const tenantId = this.tenantId();
    const courseId = this.id();
    if (!tenantId || !courseId) return;
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      const result = await this.downloadSvc.download(tenantId, courseId, this.modules());
      if (!result.ok) {
        this.downloadError.set(result.reason ?? 'Download failed.');
      }
    } finally {
      this.downloading.set(false);
    }
  }

  /** Remove this course's downloaded content. */
  protected async removeDownload(): Promise<void> {
    const tenantId = this.tenantId();
    const courseId = this.id();
    if (!tenantId || !courseId) return;
    this.downloadError.set(null);
    await this.downloadSvc.remove(tenantId, courseId);
  }
}
