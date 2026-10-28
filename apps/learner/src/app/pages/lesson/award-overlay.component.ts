import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  ElementRef,
  afterNextRender,
  input,
  output,
  viewChild,
} from '@angular/core';
import type { ApiAward } from '@assurance/lms-core';
import { SfIconComponent } from '@assurance/ui';

/**
 * What a first completion earned (forge_award.jpg): XP, a level-up, a streak extension.
 * A modal dialog: focus moves to Continue, Escape and the scrim close it, and focus
 * returns to the trigger on close.
 */
@Component({
  selector: 'assurance-award-overlay',
  standalone: true,
  imports: [SfIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div class="ao" (click)="closed.emit()">
      <div
        class="ao__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ao-title"
        (click)="$event.stopPropagation()"
      >
        <p class="ao__eyebrow">{{ award().leveledUp ? 'Level up' : 'Lesson complete' }}</p>
        <div class="ao__medal" aria-hidden="true">
          <sf-icon name="badge-shield-check" size="lg" [strokeWidth]="2" />
        </div>
        <h2 class="ao__title" id="ao-title">
          @if (award().awarded > 0) {
            +{{ award().awarded }} XP
          } @else {
            Nice work
          }
        </h2>
        <p class="ao__line">
          @if (award().leveledUp) {
            You reached level {{ award().level }}.
          } @else {
            Level {{ award().level }} · {{ award().totalXp }} XP in total.
          }
        </p>
        <ul class="ao__chips">
          @if (award().streakExtended) {
            <li class="ao__chip">
              Streak: {{ award().streakDays }} {{ award().streakDays === 1 ? 'day' : 'days' }}
            </li>
          }
          @if (award().leveledUp) {
            <li class="ao__chip">Level {{ award().level }}</li>
          }
          @for (badge of award().badges; track badge.id) {
            <li class="ao__chip">
              {{ badge.kind === 'credential' ? 'Credential' : 'Badge' }}: {{ badge.name }}
            </li>
          }
        </ul>
        <button #cta type="button" class="sf-btn sf-btn--primary" (click)="closed.emit()">
          Continue
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .ao {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: grid;
        place-items: center;
        padding: var(--sf-space-4);
        background: rgba(27, 30, 35, 0.82);
      }
      .ao__panel {
        display: grid;
        justify-items: center;
        gap: var(--sf-space-3);
        max-width: 26rem;
        text-align: center;
        color: #fff;
        animation: ao-in var(--sf-dur-slow) var(--sf-ease);
      }
      .ao__eyebrow {
        margin: 0;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-size: var(--sf-text-sm);
        font-weight: var(--sf-weight-bold);
        color: var(--sf-gold);
      }
      .ao__medal {
        width: 132px;
        height: 132px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: var(--sf-grad-badge);
        border: 3px solid var(--sf-flame);
        box-shadow: var(--sf-shadow-badge);
        color: #fff;
      }
      .ao__medal sf-icon {
        transform: scale(2.2);
      }
      .ao__title {
        margin: 0;
        font-size: 44px;
        font-weight: var(--sf-weight-black);
      }
      .ao__line {
        margin: 0;
      }
      .ao__chips {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .ao__chip {
        padding: 6px 12px;
        border-radius: var(--sf-radius-sm);
        background: var(--sf-dark-pane);
        color: var(--sf-gold);
        font-weight: var(--sf-weight-semibold);
        font-size: var(--sf-text-sm);
      }
      @keyframes ao-in {
        from {
          opacity: 0;
          transform: scale(0.94);
        }
      }
    `,
  ],
})
export class AwardOverlayComponent implements OnDestroy {
  readonly award = input.required<ApiAward>();
  readonly closed = output<void>();

  private readonly cta = viewChild.required<ElementRef<HTMLButtonElement>>('cta');
  private readonly opener = document.activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => this.cta().nativeElement.focus());
  }

  ngOnDestroy(): void {
    this.opener?.focus();
  }
}
