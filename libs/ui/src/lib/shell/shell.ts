import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface ShellLink {
  label: string;
  path: string;
}

/**
 * Spectrum-styled application shell: top app bar with brand, primary nav,
 * and a content slot. Used by all four apps so chrome stays consistent.
 */
@Component({
  selector: 'forge-shell',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="shell-header">
      <a class="brand" routerLink="/">
        <span class="brand-mark" aria-hidden="true"></span>
        <span class="brand-name">{{ appName() }}</span>
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
      gap: 32px;
      height: 56px;
      padding: 0 24px;
      background: var(--forge-surface, #fff);
      border-bottom: 2px solid var(--forge-border, #e1e1e1);
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }

    .brand:hover {
      text-decoration: none;
    }

    .brand-mark {
      width: 22px;
      height: 22px;
      border-radius: 5px;
      background: linear-gradient(
        135deg,
        var(--forge-accent, #1473e6),
        var(--forge-accent-down, #095aba)
      );
      box-shadow: var(--forge-shadow-emphasized, 0 1px 4px rgb(0 0 0 / 0.15));
    }

    .brand-name {
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: var(--forge-text, #2c2c2c);
    }

    .shell-nav {
      display: flex;
      gap: 8px;
      flex: 1;
    }

    .shell-nav a {
      padding: 6px 12px;
      border-radius: 16px;
      font-weight: 600;
      font-size: 14px;
      color: var(--forge-text-subtle, #6e6e6e);
      text-decoration: none;
      transition:
        background 130ms ease-out,
        color 130ms ease-out;
    }

    .shell-nav a:hover {
      background: var(--forge-surface-dim, #f5f5f5);
      color: var(--forge-text, #2c2c2c);
      text-decoration: none;
    }

    .shell-nav a.active {
      background: var(--forge-accent, #1473e6);
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
}
