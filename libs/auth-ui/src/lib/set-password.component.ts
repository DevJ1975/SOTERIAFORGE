import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthError, AuthService, authErrorMessageKey } from '@assurance/auth';
import { AuthShellComponent } from './auth-shell.component';

/** Minimum length the API enforces (backend AUTH_PASSWORD_VALIDATORS). */
const MIN_LENGTH = 12;

/**
 * Landing page for emailed links: `/reset-password?token=…` and
 * `/accept-invite?token=…` (route data `mode: 'invite'`). Sets the password,
 * then sends the user to sign in.
 */
@Component({
  selector: 'assurance-set-password',
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
    <assurance-auth-shell
      [title]="(invite() ? 'auth.acceptInvite' : 'auth.chooseNewPassword') | transloco"
    >
      @if (done()) {
        <p class="auth-form__success" role="status">{{ 'auth.passwordSet' | transloco }}</p>
        <a class="auth-form__link" routerLink="/login">{{ 'auth.backToSignIn' | transloco }}</a>
      } @else if (!token()) {
        <p class="auth-form__error" role="alert">{{ 'auth.errors.invalidLink' | transloco }}</p>
        <a class="auth-form__link" routerLink="/forgot-password">{{
          'auth.sendResetLink' | transloco
        }}</a>
      } @else {
        <form class="auth-form" (ngSubmit)="submit()" novalidate>
          <p class="auth-form__hint" id="new-password-hint">
            {{ 'auth.passwordHint' | transloco: { min: minLength } }}
          </p>

          <div class="auth-form__field">
            <label for="new-password">{{ 'auth.newPassword' | transloco }}</label>
            <input
              pInputText
              id="new-password"
              name="password"
              type="password"
              autocomplete="new-password"
              required
              aria-required="true"
              aria-describedby="new-password-hint"
              [attr.aria-invalid]="error() ? true : null"
              [(ngModel)]="password"
              [disabled]="loading()"
            />
          </div>

          <div class="auth-form__field">
            <label for="confirm-password">{{ 'auth.confirmPassword' | transloco }}</label>
            <input
              pInputText
              id="confirm-password"
              name="confirm"
              type="password"
              autocomplete="new-password"
              required
              aria-required="true"
              [attr.aria-invalid]="error() ? true : null"
              [attr.aria-describedby]="error() ? 'set-password-error' : null"
              [(ngModel)]="confirm"
              [disabled]="loading()"
            />
          </div>

          <div aria-live="assertive" aria-atomic="true" class="auth-form__error-region">
            @if (error()) {
              <p id="set-password-error" class="auth-form__error" role="alert">{{ error() }}</p>
            }
          </div>

          <p-button
            type="submit"
            [label]="'auth.savePassword' | transloco"
            [loading]="loading()"
            [disabled]="loading() || !password || !confirm"
          />
        </form>
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
        color: var(--sf-danger, #b00020);
        font-size: 0.875rem;
      }
      .auth-form__success {
        margin: 0;
      }
      .auth-form__link {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        color: var(--sf-ember-on-soft, inherit);
        font-weight: var(--sf-weight-semibold, 600);
        font-size: 0.875rem;
      }
    `,
  ],
})
export class SetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly route = inject(ActivatedRoute);

  protected readonly minLength = MIN_LENGTH;
  protected readonly token = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('token') ?? '')),
    { initialValue: '' },
  );
  protected readonly invite = computed(() => this.route.snapshot.data['mode'] === 'invite');

  protected password = '';
  protected confirm = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

  protected async submit(): Promise<void> {
    if (this.password !== this.confirm) {
      this.error.set(this.transloco.translate('auth.errors.passwordsDontMatch'));
      return;
    }
    if (this.password.length < MIN_LENGTH) {
      this.error.set(this.transloco.translate('auth.passwordHint', { min: MIN_LENGTH }));
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.confirmPasswordReset(this.token(), this.password);
      this.done.set(true);
    } catch (err) {
      // The API explains password-rule failures in plain words; show those as-is.
      const weak = err instanceof AuthError && err.code === 'auth/weak-password';
      this.error.set(weak ? err.message : this.transloco.translate(authErrorMessageKey(err)));
    } finally {
      this.loading.set(false);
    }
  }
}
