import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ForgeMark } from '../brand/forge-mark';

export interface ShellLink {
  label: string;
  path: string;
}

/**
 * Application shell: Soteria Forge brand header (charcoal bar, Forge Shield
 * mark, split ember wordmark) over Spectrum-structured chrome. Used by all
 * four apps so the brand stays consistent.
 */
@Component({
  selector: 'forge-shell',
  imports: [RouterLink, RouterLinkActive, ForgeMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="shell-header">
      <a class="brand" routerLink="/">
        <forge-mark [size]="34" />
        <span class="brand-name">
          {{ wordmark().pre }}<span class="ember">{{ wordmark().ember }}</span
          >{{ wordmark().post }}
        </span>
      </a>
      <nav class="shell-nav" aria-label="Primary">
        @for (link of links(); track link.path) {
          <a
            [routerLink]="link.path"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: link.path === '/' }"
            >{{ link.label }}</a
          >
        }
      </nav>
      <div class="shell-actions">
        <ng-content select="[shellActions]" />
      </div>
    </header>
    <main class="shell-content">
      <ng-content />
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .shell-header {
      display: flex;
      align-items: center;
      gap: 28px;
      height: 60px;
      padding: 0 22px;
      background: var(--sf-header, #15171b);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
    }

    .brand:hover {
      text-decoration: none;
    }

    .brand-name {
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: 19px;
      letter-spacing: 0.01em;
      text-transform: uppercase;
      color: #f4f2ee;
      white-space: nowrap;
    }

    .brand-name .ember {
      color: var(--sf-ember-hot, #ff7a3d);
    }

    .shell-nav {
      display: flex;
      gap: 8px;
      flex: 1;
    }

    .shell-nav a {
      padding: 6px 14px;
      border-radius: 16px;
      font-family: var(--forge-font, 'Barlow Semi Condensed', sans-serif);
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.02em;
      color: #c4c9cf;
      text-decoration: none;
      transition:
        background 130ms ease-out,
        color 130ms ease-out;
    }

    .shell-nav a:hover {
      background: #2a2e35;
      color: #fff;
      text-decoration: none;
    }

    .shell-nav a.active {
      background: var(--forge-accent, #e8551f);
      color: #fff;
    }

    .shell-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class ForgeShell {
  readonly appName = input.required<string>();
  readonly links = input<ShellLink[]>([]);

  /** Splits the brand word "FORGE" out of the app name for ember styling. */
  protected readonly wordmark = computed(() => {
    const name = this.appName();
    const match = /forge/i.exec(name);
    if (!match) return { pre: name, ember: '', post: '' };
    return {
      pre: name.slice(0, match.index),
      ember: match[0],
      post: name.slice(match.index + match[0].length),
    };
  });
}
