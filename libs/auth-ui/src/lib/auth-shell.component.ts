import { ChangeDetectionStrategy, Component, InjectionToken, inject, input } from '@angular/core';

/**
 * Optional brand lockup shown above the auth card. Apps that ship the Soteria
 * Forge kit assets provide it, e.g.
 * `{ provide: AUTH_BRAND_LOGO, useValue: { src: 'assets/forge/logo/forge-lockup-horizontal-on-light.svg', alt: 'Soteria Forge' } }`.
 * Apps without the kit omit it and get the plain card (no broken image).
 */
export interface AuthBrandLogo {
  readonly src: string;
  readonly alt: string;
}
export const AUTH_BRAND_LOGO = new InjectionToken<AuthBrandLogo | null>('AUTH_BRAND_LOGO', {
  providedIn: 'root',
  factory: () => null,
});

/**
 * Presentational shell for the auth pages (login, forgot-password): an
 * optional brand lockup and a centered card carrying the single page `<h1>`
 * with content projected below.
 *
 * Styled with Soteria Forge tokens (`--sf-*`), each falling back to the legacy
 * `--assurance-*` look so apps that have not loaded the kit still render.
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
      @if (logo; as l) {
        <img class="auth-shell__logo" [src]="l.src" [alt]="l.alt" width="220" height="56" />
      }
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
        flex-direction: column;
        align-items: center;
        gap: var(--sf-space-8, 2rem);
        padding: var(--sf-space-10, 2.5rem) var(--sf-space-4, 1rem);
        font-family: var(--sf-font, inherit);
      }
      .auth-shell__logo {
        display: block;
        height: 56px;
        width: auto;
        max-width: 100%;
      }
      .auth-shell__card {
        width: 100%;
        max-width: 26rem;
        display: flex;
        flex-direction: column;
        gap: var(--sf-space-4, 1rem);
        padding: var(--sf-space-8, 2rem);
        background: var(--sf-surface, #fff);
        border: 1px solid var(--sf-line, #e5e7eb);
        border-radius: var(--sf-radius-xl, var(--assurance-radius, 0.5rem));
        box-shadow: var(--sf-shadow-card, 0 1px 3px rgb(0 0 0 / 0.08));
      }
      .auth-shell__title {
        margin: 0;
        font-size: var(--sf-text-xl, 1.5rem);
        font-weight: var(--sf-weight-bold, 700);
        letter-spacing: -0.01em;
        line-height: var(--sf-leading-tight, 1.2);
        color: var(--sf-ink, var(--assurance-color-text, #111827));
      }
      @media (max-width: 30rem) {
        .auth-shell {
          padding-top: var(--sf-space-6, 1.5rem);
          gap: var(--sf-space-6, 1.5rem);
        }
        .auth-shell__card {
          padding: var(--sf-space-6, 1.5rem);
        }
      }
    `,
  ],
})
export class AuthShellComponent {
  /** Page heading (rendered as the single <h1>). */
  readonly title = input.required<string>();
  protected readonly logo = inject(AUTH_BRAND_LOGO);
}
