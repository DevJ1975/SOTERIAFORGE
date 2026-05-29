import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService, TenantService } from '@forge/auth';
import { TutorChatComponent } from '@forge/ai-tutor';

@Component({
  selector: 'forge-learner-tutor',
  standalone: true,
  imports: [RouterLink, TutorChatComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tutor-page">
      <nav class="tutor-page__nav">
        <a routerLink="/">← Back to Dashboard</a>
      </nav>

      <h1 class="tutor-page__title">AI Tutor</h1>

      @if (tenantId() && uid()) {
        <div class="tutor-page__chat">
          <forge-tutor-chat [tenantId]="tenantId()!" [uid]="uid()!" />
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
        color: var(--forge-primary, #0b5fff);
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
        color: var(--forge-text-muted, #666);
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
