import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Badge } from '@forge/shared';

interface BadgeView {
  badge: Badge;
  earned: boolean;
  /** Up-to-two-letter monogram fallback when the badge has no image. */
  monogram: string;
}

/**
 * Grid of achievement badges. Earned badges render in full color; locked
 * badges are dimmed/greyscale with a lock affordance. Shows a count summary
 * and a graceful empty state.
 */
@Component({
  selector: 'forge-badge-wall',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="badge-wall" aria-label="Badge collection">
      <header class="wall-head">
        <h3 class="wall-title">Badges</h3>
        @if (total() > 0) {
          <span class="wall-count" aria-live="polite"
            >{{ earnedCount() }} / {{ total() }} earned</span
          >
        }
      </header>

      @if (total() === 0) {
        <p class="empty">No badges available yet. Check back as you progress.</p>
      } @else {
        <ul class="grid" role="list">
          @for (item of views(); track item.badge.id) {
            <li
              class="badge"
              [class.earned]="item.earned"
              [class.locked]="!item.earned"
              [attr.aria-label]="item.badge.name + (item.earned ? ', earned' : ', locked')"
              [title]="
                item.badge.name + (item.badge.description ? ' — ' + item.badge.description : '')
              "
            >
              <div class="medallion">
                @if (item.badge.imageUrl) {
                  <img [src]="item.badge.imageUrl" [alt]="item.badge.name" loading="lazy" />
                } @else {
                  <span class="monogram" aria-hidden="true">{{ item.monogram }}</span>
                }
                @if (!item.earned) {
                  <span class="lock" aria-hidden="true">🔒</span>
                }
              </div>
              <span class="name">{{ item.badge.name }}</span>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      font-family: var(--forge-font, system-ui, sans-serif);
      color: var(--forge-text, #1a1d22);
    }

    .wall-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .wall-title {
      margin: 0;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-size: 18px;
    }

    .wall-count {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--forge-text-subtle, #8a929c);
    }

    .empty {
      margin: 0;
      padding: 24px;
      text-align: center;
      border: 1px dashed var(--forge-border, #dddcde);
      border-radius: var(--forge-radius, 8px);
      color: var(--forge-text-subtle, #8a929c);
      font-size: 13px;
    }

    .grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
      gap: 16px;
    }

    .badge {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }

    .medallion {
      position: relative;
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border: 2px solid var(--forge-border, #dddcde);
      background: var(--forge-surface, #fff);
    }

    .medallion img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .monogram {
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: 22px;
      letter-spacing: 0.02em;
      color: var(--forge-accent-fg, #fff);
    }

    .badge.earned .medallion {
      border-color: var(--forge-accent, #0b3d91);
      background: var(--forge-accent, #0b3d91);
      box-shadow: var(--forge-shadow-emphasized, 0 1px 4px rgb(0 0 0 / 0.15));
    }

    .badge.locked .medallion {
      filter: grayscale(1);
      opacity: 0.45;
    }

    .badge.locked .monogram {
      color: var(--forge-text-subtle, #8a929c);
    }

    .lock {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }

    .name {
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
      color: var(--forge-text, #1a1d22);
    }

    .badge.locked .name {
      color: var(--forge-text-subtle, #8a929c);
    }
  `,
})
export class BadgeWall {
  /** All badges defined for the tenant. */
  readonly badges = input.required<Badge[]>();

  /** Ids of the badges the current member has earned. */
  readonly earnedIds = input<string[]>([]);

  private readonly earnedSet = computed(() => new Set(this.earnedIds() ?? []));

  protected readonly views = computed<BadgeView[]>(() => {
    const earned = this.earnedSet();
    return (this.badges() ?? []).map((badge) => ({
      badge,
      earned: earned.has(badge.id),
      monogram: this.monogramFor(badge.name),
    }));
  });

  protected readonly total = computed(() => this.views().length);

  protected readonly earnedCount = computed(() => this.views().filter((v) => v.earned).length);

  private monogramFor(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
}
