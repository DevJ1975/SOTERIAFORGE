import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'forge-account',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="account">
      <h1>My learning</h1>
      <p-card>
        <p>Sign in to view purchased courses and manage your subscription (Phase 7).</p>
      </p-card>
    </section>
  `,
  styles: [
    `
      .account {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    `,
  ],
})
export class AccountComponent {}
