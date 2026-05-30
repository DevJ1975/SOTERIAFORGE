import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, TenantService } from '@assurance/auth';
import { TutorChatComponent } from '@assurance/ai-tutor';

@Component({
  selector: 'assurance-learner-tutor',
  standalone: true,
  imports: [RouterLink, TutorChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tutor-page" aria-labelledby="tutor-heading">
      <nav class="tutor-page__nav" aria-label="Page navigation">
        <a routerLink="/">← Back to Dashboard</a>
      </nav>

      <h1 id="tutor-heading" class="tutor-page__title">AI Tutor</h1>

      @if (tenantId() && uid()) {
        <div class="tutor-page__chat">
          <assurance-tutor-chat [tenantId]="tenantId()!" [uid]="uid()!" />
        </div>
      } @else {
        <p class="tutor-page__unavailable">Tutor unavailable — session not fully resolved.</p>
      }
    </section>
  `,
  styles: [
    `
      .tutor-page {
        max-width: 60rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        height: calc(100vh - 6rem);
      }
      .tutor-page__nav {
        margin-bottom: 1rem;
      }
      .tutor-page__nav a {
        color: var(--assurance-primary, #0b5fff);
        text-decoration: none;
      }
      .tutor-page__title {
        margin-bottom: 1rem;
      }
      .tutor-page__chat {
        flex: 1;
        border: 1px solid var(--surface-200, #e5e7eb);
        border-radius: 0.75rem;
        overflow: hidden;
        min-height: 0;
      }
      .tutor-page__unavailable {
        color: var(--assurance-text-muted, #666);
      }
    `,
  ],
})
export class TutorPageComponent {
  private readonly auth = inject(AuthService);
  private readonly tenantSvc = inject(TenantService);

  protected readonly tenantId = computed(() => this.tenantSvc.tenantId() ?? null);
  protected readonly uid = computed(() => this.auth.principal()?.uid ?? null);
}
