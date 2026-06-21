import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '@assurance/auth';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'assurance-storefront-auth',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="auth">
      <p-card [header]="isSignUp() ? 'Create account' : 'Sign in'">
        <form (ngSubmit)="submit()" novalidate>
          @if (isSignUp()) {
            <div class="auth__field">
              <label for="auth-display-name">Display name</label>
              <input
                pInputText
                id="auth-display-name"
                name="displayName"
                type="text"
                autocomplete="name"
                [(ngModel)]="displayName"
                [disabled]="loading()"
              />
            </div>
          }

          <div class="auth__field">
            <label for="auth-email">Email</label>
            <input
              pInputText
              id="auth-email"
              name="email"
              type="email"
              autocomplete="email"
              required
              [attr.aria-invalid]="errorMessage() ? true : null"
              [attr.aria-describedby]="errorMessage() ? 'auth-error' : null"
              [(ngModel)]="email"
              [disabled]="loading()"
            />
          </div>

          <div class="auth__field">
            <label for="auth-password">Password</label>
            <input
              pInputText
              id="auth-password"
              name="password"
              type="password"
              [autocomplete]="isSignUp() ? 'new-password' : 'current-password'"
              required
              [attr.aria-invalid]="errorMessage() ? true : null"
              [attr.aria-describedby]="errorMessage() ? 'auth-error' : null"
              [(ngModel)]="password"
              [disabled]="loading()"
            />
          </div>

          <div aria-live="assertive" class="auth__error" role="alert">
            @if (errorMessage()) {
              <p id="auth-error">{{ errorMessage() }}</p>
            }
          </div>

          <div class="auth__actions">
            <p-button
              type="submit"
              [label]="submitLabel()"
              [loading]="loading()"
              [disabled]="loading()"
            />
          </div>
        </form>

        <div class="auth__toggle">
          @if (isSignUp()) {
            <p>
              Already have an account?
              <button type="button" class="auth__link" (click)="toggleMode()">Sign in</button>
            </p>
          } @else {
            <p>
              No account yet?
              <button type="button" class="auth__link" (click)="toggleMode()">Create one</button>
            </p>
          }
        </div>
      </p-card>
    </section>
  `,
  styles: [
    `
      .auth {
        max-width: 26rem;
        margin: 3rem auto;
        padding: 0 1rem;
      }
      .auth__field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        margin-bottom: 1rem;
      }
      .auth__field label {
        font-size: 0.9rem;
        font-weight: 500;
      }
      .auth__field input {
        width: 100%;
      }
      .auth__error {
        min-height: 1.5rem;
        color: var(--red-600, #c0392b);
        font-size: 0.875rem;
        margin-bottom: 0.75rem;
      }
      .auth__actions {
        display: flex;
        justify-content: flex-end;
      }
      .auth__toggle {
        margin-top: 1.25rem;
        font-size: 0.875rem;
        text-align: center;
      }
      .auth__link {
        background: none;
        border: none;
        padding: 0;
        color: var(--assurance-primary, #0b5fff);
        cursor: pointer;
        font-size: inherit;
        text-decoration: underline;
      }
    `,
  ],
})
export class StorefrontAuthComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isSignUp = signal(false);
  protected readonly loading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected email = '';
  protected password = '';
  protected displayName = '';

  protected readonly submitLabel = computed(() => (this.isSignUp() ? 'Create account' : 'Sign in'));

  protected toggleMode(): void {
    this.isSignUp.update((v) => !v);
    this.errorMessage.set(null);
  }

  protected async submit(): Promise<void> {
    this.errorMessage.set(null);
    this.loading.set(true);
    try {
      if (this.isSignUp()) {
        await this.authService.signUp(
          this.email,
          this.password,
          this.displayName.trim() || undefined,
        );
      } else {
        await this.authService.signInWithPassword(this.email, this.password);
      }
      await this.router.navigate(['/account']);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      this.errorMessage.set(this.friendlyMessage(code));
    } finally {
      this.loading.set(false);
    }
  }

  private friendlyMessage(code?: string): string {
    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please try again later.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
