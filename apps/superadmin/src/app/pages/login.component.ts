import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '@forge/auth';

@Component({
  selector: 'forge-superadmin-login',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="login">
      <h1>Sign in</h1>
      <input pInputText type="email" placeholder="Email" [(ngModel)]="email" />
      <input pInputText type="password" placeholder="Password" [(ngModel)]="password" />
      @if (error()) {
        <p class="login__error">{{ error() }}</p>
      }
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
      .login__error {
        color: #b00020;
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
