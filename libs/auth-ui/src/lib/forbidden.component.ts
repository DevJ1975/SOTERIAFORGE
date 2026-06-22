import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoModule } from '@jsverse/transloco';

/** Shared 403 page shown when a guard denies access (replaces per-app copies). */
@Component({
  selector: 'assurance-forbidden',
  standalone: true,
  imports: [RouterLink, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="forbidden">
      <h1>{{ 'auth.forbidden.title' | transloco }}</h1>
      <p>{{ 'auth.forbidden.message' | transloco }}</p>
      <a routerLink="/login">{{ 'auth.forbidden.switch' | transloco }}</a>
    </section>
  `,
  styles: [
    `
      .forbidden {
        max-width: 40rem;
        margin: 4rem auto;
        text-align: center;
        padding: 0 1rem;
      }
    `,
  ],
})
export class ForbiddenComponent {}
