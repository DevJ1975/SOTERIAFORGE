import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SfIconComponent } from '@assurance/ui';
import { type LiveSession, formatTimeRange, isSameLocalDay } from './home.models';

const monthFmt = new Intl.DateTimeFormat('en-US', { month: 'short' });
const dayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/** Home › Next live session: date tile, title/time/instructor, crew check-in. */
@Component({
  selector: 'assurance-home-live-session-card',
  standalone: true,
  imports: [RouterLink, SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-card hl' },
  template: `
    <h2 class="sf-h3">Next live session</h2>
    <a class="hl__row" [routerLink]="session().link">
      <span class="hl__date" aria-hidden="true">
        <small>{{ month() }}</small>{{ session().startsAt.getDate() }}
      </span>
      <span class="hl__text">
        <span class="hl__title">{{ session().title }}</span>
        <span class="sf-sub hl__when">
          <span class="sf-visually-hidden">{{ fullDate() }}, </span>{{ when() }} ·
          {{ session().instructor }}
        </span>
      </span>
    </a>
    <span class="sf-tag sf-tag--success hl__crew">
      <sf-icon name="users-crew" size="xs" />
      {{ session().crewName }} · {{ session().crewCheckedIn }} checked in
    </span>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .hl__row {
        display: flex;
        align-items: center;
        gap: var(--sf-space-3);
        margin-top: 14px;
        color: inherit;
        text-decoration: none;
        border-radius: var(--sf-radius-md);
      }
      .hl__row:hover .hl__title {
        text-decoration: underline;
      }
      .hl__date {
        width: 54px;
        height: 54px;
        flex: none;
        border-radius: var(--sf-radius-md);
        background: var(--sf-muted-bg);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: var(--sf-text-lg);
        font-weight: var(--sf-weight-black);
        line-height: 1;
      }
      .hl__date small {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--sf-ink-2);
      }
      .hl__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .hl__title {
        font-size: var(--sf-text-md);
        font-weight: var(--sf-weight-bold);
      }
      .hl__crew {
        margin-top: var(--sf-space-4);
      }
    `,
  ],
})
export class HomeLiveSessionCardComponent {
  readonly session = input.required<LiveSession>();
  /** Injected "now" so "Today" is testable. */
  readonly now = input<Date>(new Date());

  protected readonly month = computed(() => monthFmt.format(this.session().startsAt));
  protected readonly fullDate = computed(() => dayFmt.format(this.session().startsAt));
  protected readonly when = computed(() => {
    const s = this.session();
    const range = formatTimeRange(s.startsAt, s.endsAt);
    return isSameLocalDay(s.startsAt, this.now()) ? `Today, ${range}` : range;
  });
}
