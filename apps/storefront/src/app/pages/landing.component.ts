import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';

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
        margin: 4rem auto;
        text-align: center;
        padding: 0 1rem;
      }
      .hero h1 {
        font-size: 2.5rem;
      }
    `,
  ],
})
export class LandingComponent {
  constructor() {
    const title = inject(Title);
    const meta = inject(Meta);
    title.setTitle('Soteria Assurance — Verifiable AI-Grounded Safety Training');
    meta.updateTag({
      name: 'description',
      content:
        'ASSURANCE delivers safety training with video, interactive games, and an AI tutor. Buy a course or go all-access.',
    });
  }
}
