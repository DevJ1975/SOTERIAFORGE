import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { MemberAdminService } from '@assurance/tenant';
import { MemberRepository } from '@assurance/data-access';
import { TenantService } from '@assurance/auth';
import { type Member, type Role, ROLES } from '@assurance/shared';

const INVITE_ROLES: readonly Role[] = ROLES.filter(
  (r) => r !== 'superadmin' && r !== 'b2c_customer',
);

@Component({
  selector: 'forge-admin-members',
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
              <td>{{ m.displayName ?? '—' }}</td>
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
                <p-button
                  label="Deactivate"
                  severity="danger"
                  size="small"
                  [disabled]="m.status === 'deactivated'"
                  (onClick)="deactivate(m)"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">No active members found.</td>
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
        background: var(--forge-color-surface, #fff);
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
  private readonly memberRepo = inject(MemberRepository);
  private readonly memberAdmin = inject(MemberAdminService);
  private readonly tenantService = inject(TenantService);

  protected readonly roleOptions = INVITE_ROLES.map((r) => ({ label: r, value: r }));

  protected readonly members = signal<Member[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);

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
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.memberRepo.listActive(tid);
      this.members.set(list);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load members');
    } finally {
      this.loading.set(false);
    }
  }

  protected async invite(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid || !this.inviteEmail || !this.inviteRole) return;
    this.inviting.set(true);
    this.inviteError.set(null);
    this.inviteLink.set(null);
    try {
      const result = await this.memberAdmin.inviteMember({
        tenantId: tid,
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
      this.inviteError.set((err as Error).message ?? 'Invite failed');
    } finally {
      this.inviting.set(false);
    }
  }

  protected async changeRole(member: Member, role: Role): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    try {
      await this.memberAdmin.setMemberRole(tid, member.uid, role);
      await this.loadMembers();
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Role change failed');
    }
  }

  protected async deactivate(member: Member): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    try {
      await this.memberAdmin.deactivateMember(tid, member.uid);
      await this.loadMembers();
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Deactivation failed');
    }
  }
}
