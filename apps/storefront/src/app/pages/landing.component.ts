import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'forge-landing',
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
export class LandingComponent {}
