import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '@assurance/auth';

@Component({
  selector: 'assurance-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="login" aria-labelledby="login-heading">
      <h1 id="login-heading">Sign in</h1>

      <div class="login__field">
        <label for="login-email" class="login__label">Email</label>
        <input
          pInputText
          id="login-email"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          aria-required="true"
          [(ngModel)]="email"
        />
      </div>

      <div class="login__field">
        <label for="login-password" class="login__label">Password</label>
        <input
          pInputText
          id="login-password"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
          aria-required="true"
          [(ngModel)]="password"
        />
      </div>

      <!-- aria-live region is always present so screen readers announce errors promptly -->
      <div aria-live="polite" aria-atomic="true" class="login__error-region">
        @if (error()) {
          <p class="login__error" role="alert">{{ error() }}</p>
        }
      </div>

      <p-button label="Sign in" [loading]="loading()" (onClick)="submit()" />
    </section>
  `,
  styles: [
    `
      .login {
        max-width: 22rem;
        margin: 4rem auto;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0 1rem;
      }
      .login__field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .login__label {
        font-size: 0.875rem;
        font-weight: 500;
      }
      .login__error-region {
        min-height: 1.25rem;
      }
      .login__error {
        color: #b00020;
        margin: 0;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.signInWithPassword(this.email, this.password);
      await this.router.navigate(['/']);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Sign-in failed');
    } finally {
      this.loading.set(false);
    }
  }
}
