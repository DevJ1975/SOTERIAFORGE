import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';
import { CardModule } from 'primeng/card';

/**
 * ForgeCardComponent — a design-system wrapper over PrimeNG's `p-card`.
 *
 * @example
 * <forge-card title="Profile">
 *   <p>Card body content goes here.</p>
 * </forge-card>
 */
@Component({
  selector: 'forge-card',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card [header]="title()">
      <ng-content />
    </p-card>
  `,
})
export class ForgeCardComponent {
  /** Card header / title text. */
  readonly title = input<string>('');
}
