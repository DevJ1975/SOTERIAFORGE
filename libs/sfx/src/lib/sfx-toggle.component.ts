import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SfxService } from './sfx.service';

/** Sound on/off switch for the app shell. */
@Component({
  selector: 'assurance-sfx-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="sfx-toggle"
      [attr.aria-pressed]="!sfx.muted()"
      [attr.title]="sfx.muted() ? 'Sound effects off' : 'Sound effects on'"
      (click)="sfx.toggle()"
    >
      <span aria-hidden="true">{{ sfx.muted() ? '🔇' : '🔊' }}</span>
      <span class="sfx-toggle__label">Sound effects</span>
    </button>
  `,
  styles: [
    `
      .sfx-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        min-width: 2.5rem;
        min-height: 2.5rem;
        padding: 0 0.5rem;
        border: 0;
        border-radius: 0.5rem;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;
      }
      /* Icon-only visually; the label stays available to screen readers. */
      .sfx-toggle__label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ],
})
export class SfxToggleComponent {
  protected readonly sfx = inject(SfxService);
}
