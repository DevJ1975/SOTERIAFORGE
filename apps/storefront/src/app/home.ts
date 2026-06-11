import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ForgeMark } from '@forge/ui';

/**
 * Storefront landing page. Entirely static marketing content so the SSR
 * prerender (RenderMode.Prerender for '') ships fully crawlable HTML with
 * zero data dependencies.
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink, ForgeMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero">
      <div class="hero-inner">
        <forge-mark [size]="84" />
        <p class="forge-tagline kicker">Soteria Forge Store</p>
        <h1>Safety training that <span class="ember">sticks</span></h1>
        <p class="sub">
          Interactive safety courses built in Forge Studio, sharpened by arcade-style practice and
          backed by verifiable Open Badges. Buy once, learn anywhere.
        </p>
        <a class="cta" routerLink="/catalog">Browse the catalog</a>
      </div>
    </section>

    <section class="forge-page features" aria-label="What you get">
      <article class="forge-card feature">
        <div class="glyph" aria-hidden="true">&#9874;</div>
        <h2>Forge Studio courses</h2>
        <p>
          Interactive, scenario-driven lessons authored by safety professionals in Forge Studio —
          not slideware with a quiz stapled on.
        </p>
      </article>
      <article class="forge-card feature">
        <div class="glyph" aria-hidden="true">&#127918;</div>
        <h2>Safety Arcade games</h2>
        <p>
          Hazard Hunter, PERIL! and friends turn drills into reflexes. Spaced, playable practice
          that keeps the knowledge hot.
        </p>
      </article>
      <article class="forge-card feature">
        <div class="glyph" aria-hidden="true">&#127941;</div>
        <h2>Open Badges you can verify</h2>
        <p>
          Every completion mints a portable, cryptographically verifiable Open Badge your employer
          or client can check in seconds.
        </p>
      </article>
    </section>

    <footer class="footer">
      <p class="forge-tagline">Forged for the frontline</p>
      <p class="fine">Soteria FORGE — safety training that sticks.</p>
    </footer>
  `,
  styles: `
    .hero {
      background: var(--sf-charcoal, #1b1e23);
      color: #f4f2ee;
      padding: 72px 24px 64px;
    }

    .hero-inner {
      max-width: 880px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 14px;
    }

    .kicker {
      color: var(--sf-spark, #ffb552);
      margin: 0;
    }

    .hero h1 {
      margin: 0;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-size: clamp(38px, 6vw, 64px);
      line-height: 1.05;
      text-transform: uppercase;
      letter-spacing: 0.01em;
      color: #f4f2ee;
    }

    .hero h1 .ember {
      color: var(--forge-accent, #e8551f);
    }

    .sub {
      margin: 0;
      max-width: 56ch;
      font-size: 17px;
      color: #c4c9cf;
    }

    .cta {
      margin-top: 14px;
      display: inline-block;
      padding: 12px 28px;
      border-radius: 22px;
      background: var(--forge-accent, #e8551f);
      color: #fff;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 600;
      font-size: 16px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-decoration: none;
      transition: background 130ms ease-out;
    }

    .cta:hover {
      background: var(--forge-accent-hover, #d8451a);
      text-decoration: none;
    }

    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
    }

    .feature h2 {
      margin: 8px 0 6px;
      font-size: 20px;
    }

    .feature p {
      margin: 0;
      color: var(--forge-text-subtle);
    }

    .glyph {
      width: 46px;
      height: 46px;
      border-radius: var(--forge-radius);
      background: var(--sf-grad-ember, linear-gradient(150deg, #f69a3c, #d8451a));
      display: grid;
      place-items: center;
      font-size: 24px;
      color: rgb(255 255 255 / 0.94);
    }

    .footer {
      margin-top: auto;
      padding: 28px 24px 36px;
      text-align: center;
      border-top: 1px solid var(--forge-border);
    }

    .footer p {
      margin: 0;
    }

    .fine {
      margin-top: 6px;
      font-size: 13px;
      color: var(--forge-text-subtle);
    }
  `,
})
export class Home {}
