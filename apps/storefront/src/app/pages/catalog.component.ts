import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { STOREFRONT_ENV } from '../../environments/storefront-environment';
import { PLACEHOLDER_COURSES, requestAccessHref, type CatalogCourse } from '../core/catalog-data';
import { SeoService } from '../core/seo.service';

// The course list is a static placeholder (see core/catalog-data.ts), so the
// whole page renders on the server with no data fetching.

@Component({
  selector: 'assurance-catalog',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="catalog">
      <h1>Course Catalog</h1>
      <p class="catalog__intro">
        Courses are assigned by your organization. Request access and we will set you up.
      </p>
      <div class="catalog__grid">
        @for (course of courses; track course.id) {
          <p-card [header]="course.title">
            <p>{{ course.description }}</p>
            <a class="catalog__request" [href]="href(course)">Request access</a>
          </p-card>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .catalog {
        max-width: 64rem;
        margin: clamp(1.5rem, 5vw, 2rem) auto;
        padding: 0 1rem;
      }
      .catalog h1 {
        font-size: clamp(1.5rem, 5vw, 2.25rem);
        line-height: 1.2;
      }
      .catalog__intro {
        color: var(--text-color-secondary, #6c757d);
      }
      .catalog__grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1rem;
      }
      @media (min-width: 30rem) {
        .catalog__grid {
          grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
        }
      }
      .catalog__request {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        margin-top: 1rem;
        font-weight: 600;
      }
    `,
  ],
})
export class CatalogComponent {
  private readonly env = inject(STOREFRONT_ENV);

  protected readonly courses = PLACEHOLDER_COURSES;

  constructor() {
    inject(SeoService).setSeo({
      title: 'Course Catalog — Soteria Assurance',
      description: 'Browse ASSURANCE safety-training courses and request access for your team.',
      path: '/catalog',
      type: 'website',
    });
  }

  protected href(course: CatalogCourse): string {
    return requestAccessHref(this.env.contactEmail, course);
  }
}
