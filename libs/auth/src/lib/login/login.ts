import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ForgeMark } from '@forge/ui';
import { PrincipalStore } from '../principal.store';

/** Maps Firebase Auth error codes onto human-readable copy. */
function friendlyAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'That email address looks invalid.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email — try signing in.';
    case 'auth/weak-password':
      return 'Password is too weak (minimum 6 characters).';
    case 'auth/too-many-requests':
      return 'Too many attempts — wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Cannot reach the authentication service. Are the emulators running?';
    default:
      return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
  }
}

@Component({
  selector: 'forge-login',
  imports: [FormsModule, ButtonModule, InputTextModule, ForgeMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop">
      <form class="card" (ngSubmit)="submit()">
        <div class="brand">
          <forge-mark [size]="56" />
          <span class="wordmark">Soteria <span class="ember">Forge</span></span>
        </div>

        <h1>{{ mode() === 'signIn' ? 'Sign in' : 'Create account' }}</h1>

        <label class="field">
          <span>Email</span>
          <input
            pInputText
            type="email"
            name="email"
            [(ngModel)]="email"
            autocomplete="email"
            placeholder="you@company.com"
            required
          />
        </label>

        <label class="field">
          <span>Password</span>
          <input
            pInputText
            type="password"
            name="password"
            [(ngModel)]="password"
            [autocomplete]="mode() === 'signIn' ? 'current-password' : 'new-password'"
            placeholder="••••••••"
            required
          />
        </label>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <p-button
          type="submit"
          [label]="mode() === 'signIn' ? 'Sign in' : 'Create account'"
          [loading]="busy()"
          [fluid]="true"
        />

        <button type="button" class="toggle" (click)="toggleMode()">
          {{
            mode() === 'signIn'
              ? 'New here? Create account (dev/emulator)'
              : 'Already have an account? Sign in'
          }}
        </button>

        @if (isLocal) {
          <p class="hint">Local emulator mode — any new email/password creates a test account.</p>
        }
      </form>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
    }

    .backdrop {
      flex: 1;
      min-height: calc(100vh - 60px);
      display: grid;
      place-items: center;
      padding: 32px 16px;
      background: var(--sf-header, #15171b);
    }

    .card {
      width: min(400px, 100%);
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 36px 32px;
      background: var(--forge-surface, #fff);
      border: 1px solid var(--forge-border, #d5d5d5);
      border-radius: var(--forge-radius, 8px);
      box-shadow: 0 12px 40px rgb(0 0 0 / 0.45);
    }

    .brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
    }

    .wordmark {
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-weight: 700;
      font-size: 22px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--forge-text, #1d1d1d);
    }

    .wordmark .ember {
      color: var(--sf-ember-hot, #ff7a3d);
    }

    h1 {
      margin: 0;
      font-family: var(--forge-font-display, 'Oswald', sans-serif);
      font-size: 18px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: center;
      color: var(--forge-text-subtle, #555);
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--forge-font, sans-serif);
      font-size: 13px;
      font-weight: 600;
      color: var(--forge-text-subtle, #555);
    }

    .field input {
      width: 100%;
      transition:
        border-color 130ms ease-out,
        box-shadow 130ms ease-out;
    }

    .field input:focus-visible {
      outline: 2px solid var(--forge-accent, #e8551f);
      outline-offset: 1px;
    }

    .error {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--forge-radius, 8px);
      background: color-mix(in srgb, var(--forge-negative, #d31510) 10%, transparent);
      color: var(--forge-negative, #d31510);
      font-family: var(--forge-font, sans-serif);
      font-size: 13px;
      font-weight: 600;
    }

    .toggle {
      align-self: center;
      border: 0;
      background: none;
      padding: 4px 8px;
      border-radius: var(--forge-radius, 8px);
      cursor: pointer;
      font-family: var(--forge-font, sans-serif);
      font-size: 13px;
      color: var(--forge-text-subtle, #555);
      text-decoration: underline;
      text-underline-offset: 3px;
      transition: color 130ms ease-out;
    }

    .toggle:hover {
      color: var(--forge-accent, #e8551f);
    }

    .toggle:focus-visible {
      outline: 2px solid var(--forge-accent, #e8551f);
      outline-offset: 1px;
    }

    .hint {
      margin: 0;
      font-family: var(--forge-font, sans-serif);
      font-size: 12px;
      text-align: center;
      color: var(--forge-text-subtle, #555);
    }
  `,
})
export class ForgeLogin {
  private readonly store = inject(PrincipalStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly hostname = inject(DOCUMENT).location?.hostname ?? '';

  protected readonly isLocal = ['localhost', '127.0.0.1'].includes(this.hostname);
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly mode = signal<'signIn' | 'createAccount'>('signIn');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected toggleMode(): void {
    this.mode.update((mode) => (mode === 'signIn' ? 'createAccount' : 'signIn'));
    this.error.set(null);
  }

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    const email = this.email().trim();
    const password = this.password();
    if (!email || !password) {
      this.error.set('Enter an email and password.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    try {
      if (this.mode() === 'signIn') {
        await this.store.signIn(email, password);
      } else {
        await this.store.signUp(email, password);
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/');
    } catch (err) {
      this.error.set(friendlyAuthError(err));
    } finally {
      this.busy.set(false);
    }
  }
}
