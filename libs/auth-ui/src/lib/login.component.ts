import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService, authErrorMessageKey } from '@assurance/auth';
import { AuthShellComponent } from './auth-shell.component';

/**
 * Accessible, tenant-scoped sign-in used by every app's `/login` route.
 *
 * Template-driven form (repo convention) + signals. On success it honours the
 * `returnUrl` query param attached by `authGuard`, defaulting to `/`. Firebase
 * errors are mapped to friendly, translated messages via `authErrorMessageKey`.
 */
@Component({
  selector: 'assurance-login',
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
    <assurance-auth-shell [title]="'auth.signIn' | transloco">
      <form class="auth-form" (ngSubmit)="submit()" novalidate>
        <div class="auth-form__field">
          <label for="login-email">{{ 'auth.email' | transloco }}</label>
          <input
            pInputText
            id="login-email"
            name="email"
            type="email"
            autocomplete="email"
            required
            aria-required="true"
            [attr.aria-invalid]="error() ? true : null"
            [attr.aria-describedby]="error() ? 'login-error' : null"
            [(ngModel)]="email"
            [disabled]="loading()"
          />
        </div>

        <div class="auth-form__field">
          <label for="login-password">{{ 'auth.password' | transloco }}</label>
          <input
            pInputText
            id="login-password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            aria-required="true"
            [attr.aria-invalid]="error() ? true : null"
            [attr.aria-describedby]="error() ? 'login-error' : null"
            [(ngModel)]="password"
            [disabled]="loading()"
          />
        </div>

        <div aria-live="assertive" aria-atomic="true" class="auth-form__error-region">
          @if (error()) {
            <p id="login-error" class="auth-form__error" role="alert">{{ error() }}</p>
          }
        </div>

        <p-button
          type="submit"
          [label]="'auth.signIn' | transloco"
          [loading]="loading()"
          [disabled]="loading() || !email || !password"
        />
      </form>

      <a class="auth-form__link" routerLink="/forgot-password">
        {{ 'auth.forgotPassword' | transloco }}
      </a>
    </assurance-auth-shell>
  `,
  styles: [
    `
      .auth-form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
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
      .auth-form__link {
        display: inline-block;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);

  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (!this.email || !this.password) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.signInWithPassword(this.email, this.password);
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
      await this.router.navigateByUrl(returnUrl);
    } catch (err) {
      this.error.set(this.transloco.translate(authErrorMessageKey(err)));
    } finally {
      this.loading.set(false);
    }
  }
}
