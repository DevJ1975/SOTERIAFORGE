import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { type ApiMember, MemberAdminService, adminErrorMessage } from '@assurance/tenant';
import { type Role, ROLES } from '@assurance/shared';

const INVITE_ROLES: readonly Role[] = ROLES.filter(
  (r) => r !== 'superadmin' && r !== 'b2c_customer',
);

@Component({
  selector: 'assurance-admin-members',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="members">
      <h1>Members</h1>

      <!-- Invite Form -->
      <div class="members__invite">
        <h2>Invite Member</h2>
        <div class="members__invite-form">
          <input
            pInputText
            type="email"
            placeholder="Email address"
            [(ngModel)]="inviteEmail"
            aria-label="Email address"
          />
          <input
            pInputText
            type="text"
            placeholder="Display name (optional)"
            [(ngModel)]="inviteDisplayName"
            aria-label="Display name"
          />
          <p-select
            [options]="roleOptions"
            [(ngModel)]="inviteRole"
            placeholder="Select role"
            aria-label="Role"
          />
          <p-button
            label="Invite"
            [loading]="inviting()"
            [disabled]="!inviteEmail || !inviteRole"
            (onClick)="invite()"
          />
        </div>
        @if (inviteError()) {
          <p class="members__error">{{ inviteError() }}</p>
        }
        @if (inviteLink()) {
          <div class="members__invite-link">
            <strong>Invite link:</strong>
            <a [href]="inviteLink()" target="_blank" rel="noopener">{{ inviteLink() }}</a>
          </div>
        }
      </div>

      @if (actionError()) {
        <p class="members__error" role="alert">{{ actionError() }}</p>
      }

      <!-- Members Table -->
      @if (loading()) {
        <p>Loading members…</p>
      } @else if (loadError()) {
        <p class="members__error">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="members()"
          [paginator]="members().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-m>
            <tr>
              <td>{{ m.displayName || '—' }}</td>
              <td>{{ m.email }}</td>
              <td>
                <p-select
                  [options]="roleOptions"
                  [ngModel]="m.role"
                  (ngModelChange)="changeRole(m, $event)"
                  aria-label="Change role"
                />
              </td>
              <td>{{ m.status }}</td>
              <td>
                <div class="members__row-actions">
                  @if (m.status === 'deactivated') {
                    <p-button
                      label="Reactivate"
                      severity="secondary"
                      size="small"
                      (onClick)="reactivate(m)"
                    />
                  } @else {
                    <p-button
                      label="Deactivate"
                      severity="danger"
                      size="small"
                      [disabled]="m.status === 'invited'"
                      (onClick)="deactivate(m)"
                    />
                  }
                  <p-button
                    label="Export data"
                    severity="secondary"
                    size="small"
                    (onClick)="exportData(m)"
                  />
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">No members found.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .members {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .members__invite {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .members__invite-form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .members__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .members__row-actions {
        display: flex;
        gap: 0.5rem;
      }
      .members__invite-link {
        margin-top: 0.75rem;
        padding: 0.5rem;
        background: #f0fdf4;
        border-radius: 0.25rem;
        word-break: break-all;
      }
    `,
  ],
})
export class MembersComponent implements OnInit {
  private readonly memberAdmin = inject(MemberAdminService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly roleOptions = INVITE_ROLES.map((r) => ({ label: r, value: r }));

  protected readonly members = signal<ApiMember[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected inviteEmail = '';
  protected inviteDisplayName = '';
  protected inviteRole: Role | null = null;
  protected readonly inviting = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly inviteLink = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadMembers();
  }

  private async loadMembers(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.members.set(await this.memberAdmin.listMembers());
    } catch (err) {
      this.loadError.set(adminErrorMessage(err, 'Failed to load members'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async invite(): Promise<void> {
    if (!this.inviteEmail || !this.inviteRole) return;
    this.inviting.set(true);
    this.inviteError.set(null);
    this.inviteLink.set(null);
    try {
      const result = await this.memberAdmin.inviteMember({
        email: this.inviteEmail,
        role: this.inviteRole,
        displayName: this.inviteDisplayName || undefined,
      });
      this.inviteLink.set(result.inviteLink);
      this.inviteEmail = '';
      this.inviteDisplayName = '';
      this.inviteRole = null;
      await this.loadMembers();
    } catch (err) {
      this.inviteError.set(adminErrorMessage(err, 'Invite failed'));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async changeRole(member: ApiMember, role: Role): Promise<void> {
    await this.run(() => this.memberAdmin.setMemberRole(member.id, role), 'Role change failed');
  }

  protected async deactivate(member: ApiMember): Promise<void> {
    await this.run(() => this.memberAdmin.deactivateMember(member.id), 'Deactivation failed');
  }

  protected async reactivate(member: ApiMember): Promise<void> {
    await this.run(() => this.memberAdmin.reactivateMember(member.id), 'Reactivation failed');
  }

  /** Downloads everything Forge holds about the member as a JSON file. */
  protected async exportData(member: ApiMember): Promise<void> {
    this.actionError.set(null);
    try {
      const data = await this.memberAdmin.exportMember(member.id);
      if (!isPlatformBrowser(this.platformId)) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `member-${member.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.actionError.set(adminErrorMessage(err, 'Export failed'));
    }
  }

  private async run(action: () => Promise<unknown>, fallback: string): Promise<void> {
    this.actionError.set(null);
    try {
      await action();
    } catch (err) {
      this.actionError.set(adminErrorMessage(err, fallback));
    }
    // Reload either way so the table shows the server's truth (e.g. a rejected role change).
    await this.loadMembers();
  }
}
