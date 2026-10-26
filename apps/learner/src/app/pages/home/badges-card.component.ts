import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SfBadgeComponent, type SfBadgeState } from '@assurance/ui';
import type { MissionBadge } from './home.models';

/** Home › Mission badges: earned / credential / in progress / locked, with words. */
@Component({
  selector: 'assurance-home-badges-card',
  standalone: true,
  imports: [SfBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-card hb' },
  template: `
    <div class="hb__head">
      <h2 class="sf-h3" id="hb-h">Mission badges</h2>
      <span class="sf-sub hb__count">{{ earnedCount() }} of {{ badges().length }} earned</span>
    </div>
    <ul class="hb__grid" aria-labelledby="hb-h">
      @for (b of visible(); track b.badge.id) {
        <li><sf-badge [name]="b.badge.name" [icon]="b.badge.icon" [state]="b.state" /></li>
      }
    </ul>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .hb__head {
        display: flex;
        align-items: baseline;
        gap: var(--sf-space-2);
      }
      .hb__count {
        margin-left: auto;
        font-size: 14px;
      }
      .hb__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: var(--sf-space-4) var(--sf-space-2);
        margin: 18px 0 0;
        padding: 0;
        list-style: none;
      }
      .hb__grid li {
        display: flex;
        justify-content: center;
      }
      .hb__grid sf-badge {
        width: 100%;
      }
      @media (max-width: 30rem) {
        .hb__grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    `,
  ],
})
export class HomeBadgesCardComponent {
  readonly badges = input.required<readonly { badge: MissionBadge; state: SfBadgeState }[]>();
  /** How many medallions to show; the count still covers the whole catalog. */
  readonly maxVisible = input<number>(6);

  protected readonly visible = computed(() => this.badges().slice(0, this.maxVisible()));
  protected readonly earnedCount = computed(
    () => this.badges().filter((b) => b.state === 'earned' || b.state === 'credential').length,
  );
}
