import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PrincipalStore } from '../principal.store';

/**
 * Session control for the shell header's [shellActions] slot. Styled for the
 * dark charcoal header: sign-in link when signed out; identity + role chip +
 * sign-out button when signed in; nothing while auth state is loading.
 */
@Component({
  selector: 'forge-auth-button',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (store.status()) {
      @case ('signedOut') {
        <a class="sign-in" routerLink="/login">Sign in</a>
      }
      @case ('signedIn') {
        <span class="who" [title]="store.email() ?? ''">{{ displayLabel() }}</span>
        @if (roleLabel(); as role) {
          <span class="chip" [class.ember]="store.canAuthor()">{{ role }}</span>
        }
        <button
          type="button"
          class="sign-out"
          (click)="signOut()"
          aria-label="Sign out"
          title="Sign out"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none">
            <path
              d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--forge-font, 'Barlow Semi Condensed', sans-serif);
    }

    .sign-in {
      padding: 6px 16px;
      border: 1px solid #3a4048;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.02em;
      color: #c4c9cf;
      text-decoration: none;
      transition:
        background 130ms ease-out,
        border-color 130ms ease-out,
        color 130ms ease-out;
    }

    .sign-in:hover {
      background: var(--forge-accent, #e8551f);
      border-color: var(--forge-accent, #e8551f);
      color: #fff;
      text-decoration: none;
    }

    .sign-in:focus-visible,
    .sign-out:focus-visible {
      outline: 2px solid var(--sf-ember-hot, #ff7a3d);
      outline-offset: 1px;
    }

    .who {
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 600;
      color: #e7e4df;
    }

    .chip {
      padding: 2px 10px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      background: #3a4048;
      color: #c4c9cf;
    }

    .chip.ember {
      background: var(--forge-accent, #e8551f);
      color: #fff;
    }

    .sign-out {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: #c4c9cf;
      cursor: pointer;
      transition:
        background 130ms ease-out,
        color 130ms ease-out;
    }

    .sign-out:hover {
      background: #2a2e35;
      color: #fff;
    }
  `,
})
export class ForgeAuthButton {
  protected readonly store = inject(PrincipalStore);

  protected readonly displayLabel = computed(
    () => this.store.displayName() || this.store.email() || 'Signed in',
  );

  protected readonly roleLabel = computed(() => this.store.role()?.replace(/_/g, ' ') ?? null);

  protected signOut(): void {
    void this.store.signOutUser();
  }
}
