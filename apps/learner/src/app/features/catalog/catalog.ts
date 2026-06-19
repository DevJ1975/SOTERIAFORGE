import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { PrincipalStore } from '@forge/auth';
import { CourseCatalogService, EnrollmentService } from '@forge/lms-core';
import type { Course, Enrollment } from '@forge/shared';

interface CatalogCard {
  course: Course;
  enrollment?: Enrollment;
}

/**
 * Course catalog: every published course for the principal's tenant, with an
 * Enroll / Continue affordance per card.
 */
@Component({
  selector: 'app-catalog',
  imports: [RouterLink, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <header class="page-head">
        <h1>Course catalog</h1>
        <p>Aviation-safety training for the ATL ramp, terminal, and airfield.</p>
      </header>

      @if (loading()) {
        <p class="muted">Loading courses…</p>
      } @else if (error()) {
        <div class="forge-card load-error">
          <h2>Couldn't load courses</h2>
          <p class="muted">We couldn't reach the catalog just now. Please try again.</p>
          <p-button label="Retry" icon="pi pi-refresh" (onClick)="load()" />
        </div>
      } @else if (cards().length === 0) {
        <p class="muted">No published courses are available yet.</p>
      } @else {
        <div class="card-grid">
          @for (card of cards(); track card.course.id) {
            <article class="forge-card course-card">
              <div class="cover" aria-hidden="true">
                @if (card.course.xpReward) {
                  <span class="xp-pill">{{ card.course.xpReward }} XP</span>
                }
              </div>
              <div class="course-body">
                <h3>{{ card.course.title }}</h3>
                <p class="desc">{{ card.course.description }}</p>
                @if (card.course.tags.length) {
                  <div class="tags">
                    @for (tag of card.course.tags; track tag) {
                      <p-tag [value]="tag" severity="secondary" />
                    }
                  </div>
                }
              </div>
              <div class="course-actions">
                @if (card.enrollment) {
                  <p-button
                    label="Continue"
                    [routerLink]="['/courses', card.course.id]"
                    styleClass="w-full"
                  />
                  <span class="progress-note">{{ card.enrollment.progressPct }}% complete</span>
                } @else {
                  <p-button
                    label="Enroll"
                    severity="secondary"
                    [loading]="enrolling() === card.course.id"
                    (onClick)="enroll(card)"
                  />
                }
              </div>
            </article>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .page-head {
      margin-bottom: 24px;
    }
    .page-head p,
    .muted {
      color: var(--forge-text-subtle);
      margin: 4px 0 0;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }
    .course-card {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 0;
      overflow: hidden;
    }
    .cover {
      height: 132px;
      background: linear-gradient(
        135deg,
        var(--forge-accent),
        var(--forge-accent-2, var(--forge-accent-hover))
      );
      position: relative;
    }
    .xp-pill {
      position: absolute;
      top: 12px;
      right: 12px;
      background: var(--forge-surface);
      color: var(--forge-text);
      border-radius: var(--forge-radius-small);
      padding: 2px 10px;
      font-size: 0.8rem;
      font-weight: 600;
      box-shadow: var(--forge-shadow-elevated);
    }
    .course-body {
      padding: 0 20px;
      flex: 1;
    }
    .course-body h3 {
      margin: 0 0 8px;
    }
    .desc {
      color: var(--forge-text-subtle);
      margin: 0 0 12px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .course-actions {
      padding: 0 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .progress-note {
      color: var(--forge-text-subtle);
      font-size: 0.85rem;
    }
    .load-error {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      border: 1px solid var(--forge-negative);
    }
  `,
})
export class Catalog {
  private readonly catalog = inject(CourseCatalogService);
  private readonly enrollments = inject(EnrollmentService);
  private readonly principal = inject(PrincipalStore);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly enrolling = signal<string | null>(null);
  private readonly data = signal<CatalogCard[]>([]);
  protected readonly cards = computed(() => this.data());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    if (!tenantId || !uid) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(false);
    try {
      const courses = await this.catalog.listPublished(tenantId);
      const cards = await Promise.all(
        courses.map(async (course) => ({
          course,
          enrollment: await this.enrollments.getEnrollment(tenantId, course.id, uid),
        })),
      );
      this.data.set(cards);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async enroll(card: CatalogCard): Promise<void> {
    const tenantId = this.principal.tenantId();
    const uid = this.principal.uid();
    const email = this.principal.email() ?? '';
    if (!tenantId || !uid) return;
    this.enrolling.set(card.course.id);
    try {
      await this.enrollments.enroll(tenantId, card.course.id, uid, email);
      await this.router.navigate(['/courses', card.course.id]);
    } finally {
      this.enrolling.set(null);
    }
  }
}
