import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardModule } from 'primeng/card';

/**
 * AssuranceCardComponent — a design-system wrapper over PrimeNG's `p-card`.
 *
 * @example
 * <assurance-card title="Profile">
 *   <p>Card body content goes here.</p>
 * </assurance-card>
 */
@Component({
  selector: 'assurance-card',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card [header]="title()">
      <ng-content />
    </p-card>
  `,
})
export class AssuranceCardComponent {
  /** Card header / title text. */
  readonly title = input<string>('');
}
