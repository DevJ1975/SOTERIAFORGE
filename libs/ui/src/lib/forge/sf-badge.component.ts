import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { SfIconComponent, type SfIconName } from './sf-icon.component';

/**
 * Badge states from the kit: earned (ember gradient), credential (gold
 * gradient — SFG-issued credentials only), in progress (dashed grey), locked
 * (dashed grey, faded, lock icon).
 */
export type SfBadgeState = 'earned' | 'credential' | 'progress' | 'locked';

const STATE_WORD: Record<SfBadgeState, string> = {
  earned: 'Earned',
  credential: 'Credential earned',
  progress: 'In progress',
  locked: 'Locked',
};

/**
 * `<sf-badge>` — a mission badge medallion with its name and a state word.
 * The state is never conveyed by colour alone: every state renders a word,
 * and locked badges also show a lock icon.
 */
@Component({
  selector: 'sf-badge',
  standalone: true,
  imports: [SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'sf-badge',
    '[class.sf-badge--earned]': "state() === 'earned'",
    '[class.sf-badge--credential]': "state() === 'credential'",
    '[class.sf-badge--progress]': "state() === 'progress'",
    '[class.sf-badge--locked]': "state() === 'locked'",
  },
  template: `
    <span class="sf-badge__medal" aria-hidden="true">
      <sf-icon [name]="icon()" size="lg" [strokeWidth]="2.2" />
    </span>
    <span class="sf-badge__name">{{ name() }}</span>
    <span class="sf-badge__meta">
      @if (state() === 'locked') {
        <sf-icon name="lock" size="xs" />
      }
      {{ metaText() }}
    </span>
  `,
  styles: [
    `
      .sf-badge__meta {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    `,
  ],
})
export class SfBadgeComponent {
  readonly name = input.required<string>();
  readonly state = input<SfBadgeState>('locked');
  readonly icon = input<SfIconName>('badge-shield');
  /** Overrides the default state word (e.g. "Due Thu"). */
  readonly meta = input<string>('');

  protected readonly metaText = computed(() => this.meta() || STATE_WORD[this.state()]);
}
