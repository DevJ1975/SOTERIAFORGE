import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';

/**
 * ForgeButtonComponent — a thin design-system wrapper over PrimeNG's `p-button`.
 *
 * Tokens (--forge-color-primary etc.) are picked up automatically because PrimeNG
 * uses CSS custom properties for its theming layer.
 *
 * @example
 * <forge-button label="Save" severity="primary" (clicked)="save()" />
 */
@Component({
  selector: 'forge-button',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-button
      [label]="label()"
      [severity]="severity()"
      [disabled]="disabled()"
      [loading]="loading()"
      (onClick)="clicked.emit($event)"
    />
  `,
})
export class ForgeButtonComponent {
  /** Button label text. */
  readonly label = input<string>('');

  /** PrimeNG severity variant. */
  readonly severity = input<
    | 'success'
    | 'info'
    | 'warn'
    | 'danger'
    | 'help'
    | 'primary'
    | 'secondary'
    | 'contrast'
    | null
    | undefined
  >(undefined);

  /** When true, the button is non-interactive. */
  readonly disabled = input<boolean>(false);

  /** When true, the button shows a loading spinner. */
  readonly loading = input<boolean>(false);

  /** Emitted when the user clicks the button. */
  readonly clicked = output<MouseEvent>();
}
