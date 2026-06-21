import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SeoService } from '../core/seo.service';

@Component({
  selector: 'assurance-landing',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <h1>Training that out-teaches the category</h1>
      <p>
        Video, interactive games, and an AI tutor grounded in real course content. Buy a course or
        go all-access.
      </p>
      <a routerLink="/catalog"><p-button label="Browse the catalog" /></a>
    </section>
  `,
  styles: [
    `
      .hero {
        max-width: 48rem;
        /* Fluid vertical rhythm: smaller on phones, larger on desktop. */
        margin: clamp(2rem, 8vw, 4rem) auto;
        text-align: center;
        padding: 0 1rem;
      }
      .hero h1 {
        /* Fluid type so the headline never overflows a 320px viewport. */
        font-size: clamp(1.75rem, 6vw, 2.5rem);
        line-height: 1.15;
        margin-bottom: 0.75rem;
      }
      .hero p {
        font-size: clamp(1rem, 2.5vw, 1.125rem);
        line-height: 1.6;
        margin: 0 auto 1.5rem;
        max-width: 38rem;
      }
      @media (max-width: 30rem) {
        .hero {
          text-align: left;
        }
        .hero p {
          margin-left: 0;
        }
      }
    `,
  ],
})
export class LandingComponent {
  constructor() {
    // SSR-safe: SeoService uses Title/Meta + the injected DOCUMENT, so all tags
    // (title, description, OG, Twitter, canonical) are server-rendered.
    inject(SeoService).setSeo({
      title: 'Soteria Assurance — Verifiable AI-Grounded Safety Training',
      description:
        'ASSURANCE delivers safety training with video, interactive games, and an AI tutor. Buy a course or go all-access.',
      path: '/',
      type: 'website',
    });
  }
}
