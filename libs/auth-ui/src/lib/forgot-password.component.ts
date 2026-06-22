import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService, authErrorMessageKey } from '@assurance/auth';
import { AuthShellComponent } from './auth-shell.component';

/**
 * Forgot-password screen. Sends a Firebase password-reset email (tenant-scoped);
 * the user completes the reset on Firebase's hosted action page.
 *
 * Enumeration-safe: an unknown email still shows the neutral "check your email"
 * confirmation rather than revealing whether an account exists.
 */
@Component({
  selector: 'assurance-forgot-password',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TranslocoModule,
    AuthShellComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <assurance-auth-shell [title]="'auth.resetPassword' | transloco">
      @if (sent()) {
        <p class="auth-form__success" role="status">{{ 'auth.checkEmail' | transloco }}</p>
        <a routerLink="/login">{{ 'auth.backToSignIn' | transloco }}</a>
      } @else {
        <form class="auth-form" (ngSubmit)="submit()" novalidate>
          <p class="auth-form__hint">{{ 'auth.resetHint' | transloco }}</p>

          <div class="auth-form__field">
            <label for="reset-email">{{ 'auth.email' | transloco }}</label>
            <input
              pInputText
              id="reset-email"
              name="email"
              type="email"
              autocomplete="email"
              required
              aria-required="true"
              [attr.aria-invalid]="error() ? true : null"
              [attr.aria-describedby]="error() ? 'reset-error' : null"
              [(ngModel)]="email"
              [disabled]="loading()"
            />
          </div>

          <div aria-live="assertive" aria-atomic="true" class="auth-form__error-region">
            @if (error()) {
              <p id="reset-error" class="auth-form__error" role="alert">{{ error() }}</p>
            }
          </div>

          <p-button
            type="submit"
            [label]="'auth.sendResetLink' | transloco"
            [loading]="loading()"
            [disabled]="loading() || !email"
          />
        </form>

        <a class="auth-form__link" routerLink="/login">{{ 'auth.backToSignIn' | transloco }}</a>
      }
    </assurance-auth-shell>
  `,
  styles: [
    `
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .auth-form__hint {
        margin: 0;
        font-size: 0.875rem;
        color: var(--assurance-color-text-muted, #6b7280);
      }
      .auth-form__field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .auth-form__field label {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .auth-form__field input {
        width: 100%;
      }
      .auth-form__error-region {
        min-height: 1.25rem;
      }
      .auth-form__error {
        margin: 0;
        color: #b00020;
        font-size: 0.875rem;
      }
      .auth-form__success {
        margin: 0;
      }
      .auth-form__link {
        display: inline-block;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected email = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal(false);

  protected async submit(): Promise<void> {
    if (!this.email) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.sendPasswordResetEmail(this.email);
      this.sent.set(true);
    } catch (err) {
      // Don't reveal whether the account exists (enumeration protection).
      if ((err as { code?: string } | null)?.code === 'auth/user-not-found') {
        this.sent.set(true);
        return;
      }
      this.error.set(this.transloco.translate(authErrorMessageKey(err)));
    } finally {
      this.loading.set(false);
    }
  }
}
