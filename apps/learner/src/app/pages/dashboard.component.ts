import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';
import { AuthService } from '@forge/auth';

@Component({
  selector: 'forge-dashboard',
  standalone: true,
  imports: [CardModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dash">
      <h1>Welcome{{ name() ? ', ' + name() : '' }}</h1>
      <p-card header="Your learning">
        <p>Assigned courses, progress, streak and XP will appear here (Phase 2+).</p>
        <a routerLink="/courses" class="dash__courses-link">Browse Courses →</a>
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
      .dash__courses-link {
        display: inline-block;
        margin-top: 0.75rem;
        color: var(--forge-primary, #0b5fff);
        text-decoration: none;
        font-weight: 600;
      }
      .dash__courses-link:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  protected readonly name = computed(() => this.auth.principal()?.displayName ?? '');
}
