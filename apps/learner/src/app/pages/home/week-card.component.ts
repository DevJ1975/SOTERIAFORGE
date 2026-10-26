import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SfIconComponent, type SfIconName } from '@assurance/ui';
import type { WeekItem, WeekItemState } from './home.models';

const STATE: Record<WeekItemState, { icon: SfIconName; word: string; tag: string }> = {
  done: { icon: 'check', word: 'Done', tag: 'sf-tag--success' },
  today: { icon: 'play', word: 'Today', tag: 'sf-tag--ember' },
  upcoming: { icon: 'clock', word: 'Upcoming', tag: '' },
};

/** Home › This week: Mon–Fri plan; each state = icon + word, not colour alone. */
@Component({
  selector: 'assurance-home-week-card',
  standalone: true,
  imports: [SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-card hw' },
  template: `
    <h2 class="sf-h3" id="hw-h">This week</h2>
    <ol class="hw__list" aria-labelledby="hw-h">
      @for (item of items(); track item.day + item.title) {
        <li class="hw__row" [class.is-today]="item.state === 'today'">
          <span class="sf-tag sf-status" [class]="state[item.state].tag">
            <sf-icon [name]="state[item.state].icon" size="xs" [strokeWidth]="2.4" />
            <span class="sf-visually-hidden">{{ state[item.state].word }}:</span>
          </span>
          <span>
            {{ item.day }} · {{ item.mode }}: {{ item.title }}
            @if (item.detail) {
              <span class="sf-sub hw__detail">· {{ item.detail }}</span>
            }
          </span>
        </li>
      }
    </ol>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .hw__list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin: 14px 0 0;
        padding: 0;
        list-style: none;
      }
      .hw__row {
        display: flex;
        align-items: center;
        gap: var(--sf-space-3);
        font-size: 14px;
      }
      .hw__row.is-today {
        font-weight: var(--sf-weight-semibold);
      }
      .hw__detail {
        font-size: 14px;
        font-weight: var(--sf-weight-regular);
      }
    `,
  ],
})
export class HomeWeekCardComponent {
  readonly items = input.required<readonly WeekItem[]>();
  protected readonly state = STATE;
}
