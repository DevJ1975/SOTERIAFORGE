import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { CourseRepository } from '@forge/data-access';
import { TenantService } from '@forge/auth';
import type { Course } from '@forge/shared';

@Component({
  selector: 'forge-learner-courses',
  standalone: true,
  imports: [RouterLink, CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="courses">
      <h1>Courses</h1>
      @if (loading()) {
        <p class="courses__status">Loading courses…</p>
      } @else if (courses().length === 0) {
        <p class="courses__status">No published courses available yet.</p>
      } @else {
        <ul class="courses__list">
          @for (course of courses(); track course.id) {
            <li class="courses__item">
              <p-card [header]="course.title">
                @if (course.description) {
                  <p>{{ course.description }}</p>
                }
                <a [routerLink]="['/courses', course.id]" class="courses__link">Start →</a>
              </p-card>
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
      .courses__status {
        color: var(--forge-text-muted, #666);
      }
      .courses__list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
      }
      .courses__item {
        display: flex;
        flex-direction: column;
      }
      .courses__link {
        display: inline-block;
        margin-top: 0.75rem;
        color: var(--forge-primary, #0b5fff);
        text-decoration: none;
        font-weight: 600;
      }
      .courses__link:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class CoursesComponent implements OnInit {
  private readonly courseRepo = inject(CourseRepository);
  private readonly tenantService = inject(TenantService);

  protected readonly courses = signal<Course[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    const tenantId = this.tenantService.tenantId();
    if (!tenantId) {
      this.loading.set(false);
      return;
    }
    try {
      const result = await this.courseRepo.listPublished(tenantId);
      this.courses.set(result);
    } catch (err) {
      console.error('[CoursesComponent] Failed to load courses', err);
    } finally {
      this.loading.set(false);
    }
  }
}
