import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { ButtonModule } from 'primeng/button';
import { PrincipalStore } from '@forge/auth';
import {
  completedLessonsOf,
  ForgeCatalog,
  ForgeEnrollment,
  toCatalogCourse,
  type CatalogCourse,
} from '@forge/lms-core';
import type { Enrollment } from '@forge/shared';

type CatalogState = 'loading' | 'ready' | 'no-tenant' | 'error';

/**
 * Learner course catalog: every published Forge Studio course for the
 * caller's tenant, with per-course progress when an enrollment exists.
 */
@Component({
  selector: 'app-catalog-page',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="head">
        <h1>My Training</h1>
        <p>Published safety courses for your team. Pick up right where you left off.</p>
      </section>

      @switch (state()) {
        @case ('loading') {
          <div class="course-grid" aria-hidden="true">
            @for (skeleton of [0, 1, 2]; track skeleton) {
              <article class="forge-card course-card">
                <div class="cover skeleton"></div>
                <div class="skeleton skeleton-line title"></div>
                <div class="skeleton skeleton-line"></div>
                <div class="skeleton skeleton-line short"></div>
              </article>
            }
          </div>
        }
        @case ('no-tenant') {
          <section class="forge-card empty-state">
            <h3>No team workspace</h3>
            <p>
              Your account isn't linked to a team yet, so there are no courses to show. Ask your
              admin for an invite.
            </p>
          </section>
        }
        @case ('error') {
          <section class="forge-card empty-state">
            <h3>Couldn't load your courses</h3>
            <p>Something went wrong talking to the training service. Refresh to try again.</p>
          </section>
        }
        @case ('ready') {
          @if (courses().length === 0) {
            <section class="forge-card empty-state">
              <h3>Nothing here yet</h3>
              <p>No published courses yet — ask your admin to publish from Forge Studio.</p>
            </section>
          } @else {
            <div class="course-grid">
              @for (course of courses(); track course.id) {
                <article class="forge-card course-card">
                  @if (course.coverImageUrl) {
                    <img class="cover" [src]="course.coverImageUrl" alt="" loading="lazy" />
                  } @else {
                    <div class="cover ember" aria-hidden="true">
                      <span class="emblem">&#9874;</span>
                    </div>
                  }
                  <h3>{{ course.title }}</h3>
                  @if (course.excerpt) {
                    <p class="excerpt">{{ course.excerpt }}</p>
                  }
                  <div class="meta">
                    <span
                      >{{ course.lessonCount }}
                      {{ course.lessonCount === 1 ? 'lesson' : 'lessons' }}</span
                    >
                    @if (enrollmentFor(course.id)?.completed) {
                      <span class="completed-pill">Completed</span>
                    }
                  </div>
                  @if (enrollmentFor(course.id); as enrollment) {
                    <div
                      class="progress-track"
                      role="progressbar"
                      [attr.aria-valuenow]="enrollment.progressPct"
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div class="progress-fill" [style.width.%]="enrollment.progressPct"></div>
                    </div>
                  }
                  <p-button
                    [label]="ctaLabel(course)"
                    [routerLink]="['/courses', course.id]"
                    styleClass="cta"
                  />
                </article>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .head {
      margin-bottom: 24px;
    }

    .head p {
      color: var(--forge-text-subtle);
      margin: 0;
      max-width: 60ch;
    }

    .course-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }

    .course-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      transition:
        transform 130ms ease-out,
        box-shadow 130ms ease-out;
    }

    .course-card:hover {
      transform: translateY(-2px);
      box-shadow: var(--forge-shadow-elevated);
    }

    .course-card h3 {
      margin: 0;
    }

    .cover {
      height: 130px;
      border-radius: var(--forge-radius);
      object-fit: cover;
      width: 100%;
    }

    .cover.ember {
      background: var(--sf-grad-ember);
      display: grid;
      place-items: center;
    }

    .cover.ember .emblem {
      font-size: 44px;
      color: rgb(255 255 255 / 0.92);
      text-shadow: 0 2px 6px rgb(0 0 0 / 0.25);
    }

    .excerpt {
      color: var(--forge-text-subtle);
      margin: 0;
      flex: 1;
    }

    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--forge-text-subtle);
      font-size: 13px;
    }

    .completed-pill {
      color: var(--forge-positive);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-size: 11px;
    }

    .progress-track {
      height: 6px;
      border-radius: 3px;
      background: var(--forge-surface-dim);
      border: 1px solid var(--forge-border);
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--sf-grad-ember);
      border-radius: 3px;
      transition: width 200ms ease-out;
    }

    .empty-state {
      max-width: 560px;
    }

    .empty-state p {
      color: var(--forge-text-subtle);
      margin: 0;
    }

    /* Loading skeletons */
    .skeleton {
      background: linear-gradient(
        100deg,
        var(--forge-surface-dim) 40%,
        var(--forge-border) 50%,
        var(--forge-surface-dim) 60%
      );
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    .skeleton-line {
      height: 14px;
      border-radius: var(--forge-radius-small);
    }

    .skeleton-line.title {
      height: 20px;
      width: 65%;
    }

    .skeleton-line.short {
      width: 40%;
    }

    @keyframes shimmer {
      to {
        background-position: -200% 0;
      }
    }
  `,
})
export class CatalogPage {
  private readonly db = inject(Firestore);
  private readonly catalog = inject(ForgeCatalog);
  private readonly enrollments = inject(ForgeEnrollment);
  private readonly principal = inject(PrincipalStore);

  protected readonly state = signal<CatalogState>('loading');
  protected readonly courses = signal<CatalogCourse[]>([]);
  /** courseId → the caller's enrollment, for the per-card progress bar. */
  protected readonly enrollmentsById = signal<Record<string, Enrollment>>({});

  /** Guards the load effect against re-running for the same principal. */
  private loadedFor: string | null = null;

  constructor() {
    this.principal.init();
    effect(() => {
      const status = this.principal.status();
      const tenantId = this.principal.tenantId();
      const uid = this.principal.uid();
      if (status === 'loading') return;
      if (status === 'signedOut' || !tenantId || !uid) {
        this.state.set('no-tenant');
        return;
      }
      const key = `${tenantId}:${uid}`;
      if (this.loadedFor === key) return;
      this.loadedFor = key;
      void this.load(tenantId, uid);
    });
  }

  protected enrollmentFor(courseId: string): Enrollment | undefined {
    return this.enrollmentsById()[courseId];
  }

  protected ctaLabel(course: CatalogCourse): string {
    const enrollment = this.enrollmentFor(course.id);
    if (enrollment?.completed) return 'Review course';
    if (completedLessonsOf(enrollment).length > 0) return 'Continue';
    return 'Start course';
  }

  private async load(tenantId: string, uid: string): Promise<void> {
    this.state.set('loading');
    try {
      const published = await this.catalog.listPublished(this.db, tenantId);
      this.courses.set(published.map(toCatalogCourse));
      // Per-course enrollment lookups (one doc read each, fine at catalog scale).
      const entries = await Promise.all(
        published.map(
          async (course) =>
            [course.id, await this.enrollments.get(this.db, tenantId, course.id, uid)] as const,
        ),
      );
      const byId: Record<string, Enrollment> = {};
      for (const [courseId, enrollment] of entries) {
        if (enrollment) byId[courseId] = enrollment;
      }
      this.enrollmentsById.set(byId);
      this.state.set('ready');
    } catch (error) {
      console.error('[learner] failed to load the course catalog', error);
      this.state.set('error');
    }
  }
}
