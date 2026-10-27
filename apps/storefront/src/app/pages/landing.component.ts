import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_ENV } from '../../environments/storefront-environment';
import { requestAccessHref } from '../core/catalog-data';
import { SeoService } from '../core/seo.service';

@Component({
  selector: 'assurance-landing',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <h1>Training that out-teaches the category</h1>
      <p>
        Video, interactive games, and an AI tutor grounded in real course content. Browse the
        catalog and request access for your team.
      </p>
      <div class="hero__actions">
        <a class="hero__cta" routerLink="/catalog">Browse the catalog</a>
        <a class="hero__cta hero__cta--alt" [href]="requestHref">Request access</a>
      </div>
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
      .hero__actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.75rem;
      }
      .hero__cta {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 0 1.25rem;
        border-radius: 6px;
        background: var(--assurance-primary, #0b5fff);
        color: #fff;
        font-weight: 600;
        text-decoration: none;
      }
      .hero__cta--alt {
        background: none;
        color: var(--assurance-primary, #0b5fff);
        border: 2px solid var(--assurance-primary, #0b5fff);
      }
      @media (max-width: 30rem) {
        .hero__actions {
          justify-content: flex-start;
        }
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
  protected readonly requestHref = requestAccessHref(inject(STOREFRONT_ENV).contactEmail);

  constructor() {
    // SSR-safe: SeoService uses Title/Meta + the injected DOCUMENT, so all tags
    // (title, description, OG, Twitter, canonical) are server-rendered.
    inject(SeoService).setSeo({
      title: 'Soteria Assurance — Verifiable AI-Grounded Safety Training',
      description:
        'ASSURANCE delivers safety training with video, interactive games, and an AI tutor. Browse the catalog and request access.',
      path: '/',
      type: 'website',
    });
  }
}
