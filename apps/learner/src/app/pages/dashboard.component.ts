import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CardModule } from 'primeng/card';
import { AuthService } from '@forge/auth';

@Component({
  selector: 'forge-dashboard',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dash">
      <h1>Welcome{{ name() ? ', ' + name() : '' }}</h1>
      <p-card header="Your learning">
        <p>Assigned courses, progress, streak and XP will appear here (Phase 2+).</p>
      </p-card>
    </section>
  `,
  styles: [
    `
      .dash {
        max-width: 60rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  protected readonly name = computed(() => this.auth.principal()?.displayName ?? '');
}
