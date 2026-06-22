import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '@assurance/auth';

/**
 * Header sign-out control. Shows the signed-in principal (email + role) and a
 * Sign out button that calls `AuthService.signOutUser()` (which also purges
 * shared-device offline data) and navigates to `redirectTo` (default `/login`).
 * Renders nothing when no principal is resolved.
 */
@Component({
  selector: 'assurance-user-menu',
  standalone: true,
  imports: [ButtonModule, TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (auth.principal(); as p) {
      <div class="user-menu">
        <span class="user-menu__id">
          <span class="user-menu__email">{{ p.email }}</span>
          <span class="user-menu__role">{{ p.claims.role }}</span>
        </span>
        <p-button
          [label]="'auth.signOut' | transloco"
          severity="secondary"
          size="small"
          [loading]="busy()"
          (onClick)="signOut()"
        />
      </div>
    }
  `,
  styles: [
    `
      .user-menu {
        display: inline-flex;
        align-items: center;
        gap: 0.75rem;
      }
      .user-menu__id {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
        text-align: right;
      }
      .user-menu__email {
        font-size: 0.8125rem;
      }
      .user-menu__role {
        font-size: 0.6875rem;
        opacity: 0.8;
        text-transform: capitalize;
      }
    `,
  ],
})
export class UserMenuComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Where to navigate after signing out. */
  readonly redirectTo = input<string>('/login');

  protected readonly busy = signal(false);

  protected async signOut(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signOutUser();
    } finally {
      this.busy.set(false);
      await this.router.navigateByUrl(this.redirectTo());
    }
  }
}
