import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Presentational shell for the auth pages (login, forgot-password): a centered
 * card carrying the single page `<h1>` with content projected below.
 *
 * It deliberately does NOT render a `<main>` landmark or skip link — each app
 * shell already provides those around its `<router-outlet>`, so rendering them
 * here too would nest `<main>` elements and duplicate the `main-content` id.
 */
@Component({
  selector: 'assurance-auth-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth-shell">
      <div class="auth-shell__card" aria-labelledby="auth-heading">
        <h1 id="auth-heading" class="auth-shell__title">{{ title() }}</h1>
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      .auth-shell {
        display: flex;
        justify-content: center;
        padding: 2.5rem 1.5rem;
      }
      .auth-shell__card {
        width: 100%;
        max-width: 24rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 2rem;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: var(--assurance-radius, 0.5rem);
        box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
      }
      .auth-shell__title {
        margin: 0;
        font-size: 1.5rem;
        color: var(--assurance-color-text, #111827);
      }
    `,
  ],
})
export class AuthShellComponent {
  /** Page heading (rendered as the single <h1>). */
  readonly title = input.required<string>();
}
