import { ChangeDetectionStrategy, Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ForgeAdminApi, PrincipalStore } from '@forge/auth';
import type { Member, Role } from '@forge/shared';

/** Tenant-scoped roles an admin can invite (TENANT_SCOPED_ROLES minus 'b2c_customer'). */
// Mutable array type: PrimeNG's p-select [options] input rejects readonly arrays.
export const INVITABLE_ROLE_OPTIONS: { label: string; value: Role }[] = [
  { label: 'Tenant admin', value: 'tenant_admin' },
  { label: 'Instructor', value: 'instructor' },
  { label: 'Learner', value: 'learner' },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal invite form. On success it emits an optimistic `Member` row
 * (status 'invited') for the page to insert while the Firestore snapshot
 * listener catches up with the server-written document.
 */
@Component({
  selector: 'app-invite-member-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonModule, DialogModule, InputTextModule, SelectModule],
  template: `
    <p-dialog
      header="Invite member"
      [modal]="true"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [draggable]="false"
      [style]="{ width: 'min(440px, 92vw)' }"
    >
      <form class="invite-form" (ngSubmit)="submit()">
        <label class="field">
          <span>Email</span>
          <input
            pInputText
            type="email"
            name="email"
            [(ngModel)]="email"
            autocomplete="off"
            placeholder="operator@company.com"
            required
          />
        </label>

        <label class="field">
          <span>Display name <em>(optional)</em></span>
          <input
            pInputText
            type="text"
            name="displayName"
            [(ngModel)]="displayName"
            autocomplete="off"
            placeholder="Jordan Smith"
          />
        </label>

        <div class="field">
          <span>Role</span>
          <p-select
            name="role"
            ariaLabel="Role"
            [(ngModel)]="role"
            [options]="roleOptions"
            optionLabel="label"
            optionValue="value"
            appendTo="body"
            [style]="{ width: '100%' }"
          />
        </div>

        @if (error(); as message) {
          <p class="error" role="alert">{{ message }}</p>
        }

        <div class="actions">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            [text]="true"
            [disabled]="pending()"
            (onClick)="close()"
          />
          <p-button type="submit" label="Send invite" icon="pi pi-envelope" [loading]="pending()" />
        </div>
      </form>
    </p-dialog>
  `,
  styles: `
    .invite-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-top: 4px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--forge-font);
      font-size: 13px;
      font-weight: 600;
      color: var(--forge-text-subtle);

      em {
        font-style: normal;
        font-weight: 400;
      }

      input {
        width: 100%;
        transition:
          border-color 130ms ease-out,
          box-shadow 130ms ease-out;
      }
    }

    .error {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--forge-radius);
      background: color-mix(in srgb, var(--forge-negative) 10%, transparent);
      color: var(--forge-negative);
      font-size: 13px;
      font-weight: 600;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class InviteMemberDialog {
  private readonly api = inject(ForgeAdminApi);
  private readonly principal = inject(PrincipalStore);

  /** Two-way visibility (used with `[(visible)]` from the page). */
  readonly visible = model(false);
  /** Emits the optimistic member row after a successful invite. */
  readonly invited = output<Member>();

  protected readonly roleOptions = INVITABLE_ROLE_OPTIONS;
  protected readonly email = signal('');
  protected readonly displayName = signal('');
  protected readonly role = signal<Role>('learner');
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected onVisibleChange(visible: boolean): void {
    this.visible.set(visible);
    if (!visible) this.reset();
  }

  protected close(): void {
    this.visible.set(false);
    this.reset();
  }

  protected async submit(): Promise<void> {
    if (this.pending()) return;

    const email = this.email().trim().toLowerCase();
    const displayName = this.displayName().trim();
    const role = this.role();
    const tenantId = this.principal.tenantId();

    if (!EMAIL_PATTERN.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (!tenantId) {
      this.error.set('Your account is not bound to a tenant — cannot invite members.');
      return;
    }

    this.pending.set(true);
    this.error.set(null);
    try {
      const result = await this.api.inviteMember({
        email,
        role,
        tenantId,
        ...(displayName ? { displayName } : {}),
      });
      this.invited.emit({
        uid: result.uid,
        tenantId,
        role,
        status: 'invited',
        email,
        ...(displayName ? { displayName } : {}),
        xp: 0,
        level: 1,
        streakDays: 0,
        createdAt: new Date().toISOString(),
      });
      this.close();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Invite failed. Please try again.');
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    this.email.set('');
    this.displayName.set('');
    this.role.set('learner');
    this.error.set(null);
    this.pending.set(false);
  }
}
