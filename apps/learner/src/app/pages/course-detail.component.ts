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
import { CardModule } from 'primeng/card';
import { ModulePlayerComponent } from '@assurance/player';
import { ModuleRepository, EnrollmentRepository } from '@assurance/data-access';
import { EnrollmentService } from '@assurance/lms-core';
import { AuthService, TenantService } from '@assurance/auth';
import { TutorChatComponent } from '@assurance/ai-tutor';
import type { Module, Enrollment } from '@assurance/shared';

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

      @if (loading()) {
        <p class="course-detail__status">Loading…</p>
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
                      @if (isComplete(mod.id)) {
                        <span class="course-detail__badge" aria-label="Completed">✓</span>
                      }
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
        color: var(--assurance-primary, #0b5fff);
        text-decoration: none;
      }
      .course-detail__status {
        color: var(--assurance-text-muted, #666);
      }
      .course-detail__layout {
        display: grid;
        grid-template-columns: 16rem 1fr;
        gap: 1.5rem;
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
      .course-detail__player {
        min-height: 20rem;
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
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly auth = inject(AuthService);
  private readonly tenantSvc = inject(TenantService);

  protected readonly modules = signal<Module[]>([]);
  protected readonly selectedModule = signal<Module | null>(null);
  protected readonly loading = signal(true);

  // These are typed to handle null TenantService values
  protected readonly tenantId = computed(() => this.tenantSvc.tenantId() ?? null);
  protected readonly uid = computed(() => this.auth.principal()?.uid ?? null);

  /** Live enrollment stream piped through toSignal (null until loaded). */
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
      // Load modules
      const mods = await this.moduleRepo.listOrdered(tenantId, courseId);
      this.modules.set(mods);

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

      // Subscribe to live enrollment updates
      this.enrollmentRepo.watch(tenantId, courseId, uid).subscribe((e) => {
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
  }
}
