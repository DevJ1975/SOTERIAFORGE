import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SfIconComponent, SfProgressRingComponent } from '@assurance/ui';
import type { ContinueLearning } from './home.models';

/** Home › Continue: progress ring, course, and the primary "Resume" action. */
@Component({
  selector: 'assurance-home-continue-card',
  standalone: true,
  imports: [RouterLink, SfIconComponent, SfProgressRingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-card hc' },
  template: `
    <sf-progress-ring
      [value]="data().percent"
      [caption]="data().ringCaption"
      [label]="data().courseTitle + ' progress'"
      [size]="ringSize()"
    />
    <div class="hc__body">
      <span class="sf-tag sf-tag--ember">CONTINUE</span>
      <h2 class="sf-h2 hc__title">{{ data().courseTitle }}</h2>
      <p class="sf-sub hc__sub">{{ data().subtitle }}</p>
      <div class="hc__actions">
        <a class="sf-btn sf-btn--primary" [routerLink]="data().resumeLink">
          {{ data().resumeLabel }}
          <sf-icon name="arrow-right" size="sm" />
        </a>
        <span class="sf-sub">{{ data().timeLeft }}</span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 28px;
        padding: 28px;
      }
      .hc__body {
        flex: 1;
        min-width: 0;
      }
      .hc__title {
        margin-top: 10px;
      }
      .hc__sub {
        margin: var(--sf-space-1) 0 0;
      }
      .hc__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--sf-space-3);
        margin-top: var(--sf-space-4);
      }
      @media (max-width: 30rem) {
        :host {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--sf-space-4);
          padding: var(--sf-space-5);
        }
        .hc__actions .sf-btn {
          width: 100%;
        }
      }
    `,
  ],
})
export class HomeContinueCardComponent {
  readonly data = input.required<ContinueLearning>();
  readonly ringSize = input<number>(132);
}
