import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SfIconComponent } from '@assurance/ui';
import type { CoachNudge } from './home.models';

/**
 * Home › Forge AI coach nudge. Product rules: the coach never grades and
 * always shows its sources, so the sources line is always rendered.
 */
@Component({
  selector: 'assurance-home-coach-card',
  standalone: true,
  imports: [RouterLink, SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-card hk' },
  template: `
    <div class="hk__head">
      <span class="hk__mark" aria-hidden="true"
        ><sf-icon name="ask-forge-sparkle" size="sm"
      /></span>
      <div>
        <h2 class="sf-h3">Forge AI coach</h2>
        <p class="sf-sub hk__sub">Grounded in your course · never grades</p>
      </div>
    </div>
    <div class="hk__body" aria-live="polite">
      @if (!dismissed()) {
        <p class="sf-msg sf-msg--ai hk__msg">{{ nudge().message }}</p>
        <p class="hk__sources">
          <span class="hk__sources-label">Sources:</span>
          @for (s of nudge().sources; track s) {
            <span class="sf-tag">{{ s }}</span>
          }
        </p>
        <div class="hk__actions">
          <a
            class="sf-chip sf-chip--suggest"
            [routerLink]="nudge().acceptLink"
            [queryParams]="nudge().acceptQueryParams"
            >{{ nudge().acceptLabel }}</a
          >
          <button type="button" class="sf-chip" (click)="dismissed.set(true)">
            {{ nudge().dismissLabel }}
          </button>
        </div>
      } @else {
        <p #done class="sf-sub hk__done" tabindex="-1">
          No problem. Ask Forge any time from a lesson.
        </p>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .hk__head {
        display: flex;
        gap: var(--sf-space-3);
        align-items: flex-start;
      }
      .hk__mark {
        display: inline-flex;
        padding: var(--sf-space-2);
        border-radius: var(--sf-radius-sm);
        background: var(--sf-ember-soft);
        color: var(--sf-ember-on-soft);
      }
      .hk__sub {
        margin: 2px 0 0;
        font-size: 14px;
      }
      .hk__msg {
        max-width: none;
        margin: var(--sf-space-4) 0 0;
        font-size: 14px;
      }
      .hk__sources {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin: var(--sf-space-3) 0 0;
        font-size: var(--sf-text-xs);
      }
      .hk__sources-label {
        color: var(--sf-ink-2);
        font-weight: var(--sf-weight-semibold);
      }
      .hk__actions {
        display: flex;
        gap: var(--sf-space-2);
        margin-top: var(--sf-space-4);
      }
      .hk__actions .sf-chip {
        text-decoration: none;
      }
      .hk__done {
        margin: var(--sf-space-4) 0 0;
      }
    `,
  ],
})
export class HomeCoachCardComponent {
  readonly nudge = input.required<CoachNudge>();
  protected readonly dismissed = signal(false);
  private readonly doneEl = viewChild<ElementRef<HTMLElement>>('done');

  constructor() {
    // "Later" removes the focused button; move focus to the confirmation so
    // keyboard and screen-reader users are not dropped to <body>.
    effect(() => this.doneEl()?.nativeElement.focus());
  }
}
