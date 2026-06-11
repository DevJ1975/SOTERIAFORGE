import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PrincipalStore } from '@forge/auth';

/**
 * Post-purchase landing page (Stripe Checkout successUrl):
 * /thanks?product={id}[&emulated=1].
 *
 * The Stripe webhook grants the entitlement and mirrors it into the user's
 * custom claims server-side; this page forces an ID-token refresh
 * (PrincipalStore.refreshClaims) once auth settles so the new entitlement is
 * visible immediately. `?emulated=1` marks a Stripe-less emulator purchase.
 *
 * Client-rendered only (RenderMode.Client): everything here depends on the
 * signed-in browser session.
 */
@Component({
  selector: 'app-thanks-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <section class="forge-card celebration">
        <div class="confetti" aria-hidden="true">
          @for (piece of confettiPieces; track piece) {
            <i></i>
          }
        </div>
        <h1>You're in!</h1>
        @if (emulated()) {
          <span class="chip test-mode">Test mode</span>
        }
        <p>
          Your purchase is confirmed and your new training is being added to your library right now.
        </p>
        <div class="actions">
          <!-- TODO(domain-wiring Phase 8): point 'Start learning' at the learner
               app origin (https://app.…) once domains are wired; until then the
               in-store library is the landing spot. -->
          <a class="cta" routerLink="/library">Start learning</a>
          <a class="quiet" routerLink="/catalog">Keep browsing</a>
        </div>
      </section>
    </div>
  `,
  styles: `
    .celebration {
      position: relative;
      overflow: hidden;
      max-width: 640px;
      margin: 40px auto 0;
      padding: 48px 40px;
      text-align: center;
    }

    h1 {
      font-size: 44px;
      margin: 0 0 6px;
      text-transform: uppercase;
    }

    p {
      color: var(--forge-text-subtle);
      margin: 10px auto 0;
      max-width: 46ch;
    }

    .chip.test-mode {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: var(--forge-notice);
      color: #fff;
    }

    .actions {
      display: flex;
      gap: 18px;
      justify-content: center;
      align-items: center;
      margin-top: 26px;
    }

    .cta {
      display: inline-block;
      padding: 11px 26px;
      border-radius: 22px;
      background: var(--forge-accent);
      color: #fff;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-decoration: none;
      transition: background 130ms ease-out;
    }

    .cta:hover {
      background: var(--forge-accent-hover);
      text-decoration: none;
    }

    .quiet {
      font-weight: 600;
    }

    /* CSS-only confetti: a handful of falling slivers, brand palette. */
    .confetti {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .confetti i {
      position: absolute;
      top: -12px;
      width: 8px;
      height: 14px;
      border-radius: 2px;
      opacity: 0;
      animation: confetti-fall 2.8s ease-in infinite;
    }

    .confetti i:nth-child(odd) {
      background: var(--sf-ember, #e8551f);
    }

    .confetti i:nth-child(even) {
      background: var(--sf-spark, #ffb552);
    }

    .confetti i:nth-child(3n) {
      background: var(--sf-steel, #3a4048);
    }

    .confetti i:nth-child(1) {
      left: 6%;
      animation-delay: 0s;
    }
    .confetti i:nth-child(2) {
      left: 16%;
      animation-delay: 0.5s;
    }
    .confetti i:nth-child(3) {
      left: 26%;
      animation-delay: 1.1s;
    }
    .confetti i:nth-child(4) {
      left: 36%;
      animation-delay: 0.2s;
    }
    .confetti i:nth-child(5) {
      left: 46%;
      animation-delay: 1.6s;
    }
    .confetti i:nth-child(6) {
      left: 56%;
      animation-delay: 0.8s;
    }
    .confetti i:nth-child(7) {
      left: 66%;
      animation-delay: 1.9s;
    }
    .confetti i:nth-child(8) {
      left: 76%;
      animation-delay: 0.4s;
    }
    .confetti i:nth-child(9) {
      left: 86%;
      animation-delay: 1.3s;
    }
    .confetti i:nth-child(10) {
      left: 94%;
      animation-delay: 0.9s;
    }

    @keyframes confetti-fall {
      0% {
        transform: translateY(0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateY(340px) rotate(540deg);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .confetti i {
        animation: none;
      }
    }
  `,
})
export class ThanksPage {
  private readonly principal = inject(PrincipalStore);

  protected readonly confettiPieces = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  protected readonly emulated = signal(false);
  protected readonly productId = signal<string | null>(null);

  constructor() {
    const queryParams = inject(ActivatedRoute).snapshot.queryParamMap;
    this.emulated.set(queryParams.get('emulated') === '1');
    this.productId.set(queryParams.get('product'));

    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.principal.init();
    // Refresh the claims mirror once the session has settled (the page is hit
    // right after the redirect back from Stripe, when auth may still be
    // rehydrating).
    let refreshed = false;
    effect(() => {
      if (refreshed || this.principal.status() !== 'signedIn') return;
      refreshed = true;
      void this.principal.refreshClaims();
    });
  }
}
