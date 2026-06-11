import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Firestore } from '@angular/fire/firestore';
// onSnapshot comes from the root `firebase/firestore` package so its types line
// up with the converter-typed refs from @forge/data-access (which uses the
// same package; @angular/fire re-exports a nested copy with divergent types).
import { onSnapshot } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ForgeAdminApi, PrincipalStore } from '@forge/auth';
import { membersCol } from '@forge/data-access';
import type { Member, Role } from '@forge/shared';
import { INVITABLE_ROLE_OPTIONS, InviteMemberDialog } from './invite-member-dialog';
import {
  filterMembers,
  memberInitial,
  memberLabel,
  roleChipKind,
  sortMembers,
  statusChipKind,
  upsertMember,
} from './members.utils';

interface Toast {
  kind: 'positive' | 'negative';
  text: string;
}

/**
 * Tenant member management: live Firestore list of the current tenant's
 * members with search, invites (Cloud Function `inviteMember`), and inline
 * role changes (`setUserRole`) with optimistic updates.
 */
@Component({
  selector: 'app-members-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    InviteMemberDialog,
  ],
  templateUrl: './members-page.html',
  styleUrl: './members-page.scss',
})
export class MembersPage {
  private readonly principal = inject(PrincipalStore);
  private readonly api = inject(ForgeAdminApi);
  // Optional so the page constructs in TestBed without Firebase providers;
  // the signed-out / no-tenant states cover that path.
  private readonly firestore = inject(Firestore, { optional: true });

  protected readonly authStatus = this.principal.status;
  protected readonly tenantId = this.principal.tenantId;

  protected readonly members = signal<Member[]>([]);
  protected readonly membersLoading = signal(false);
  protected readonly query = signal('');
  protected readonly inviteOpen = signal(false);
  protected readonly toast = signal<Toast | null>(null);
  /** uid of the row with an in-flight role change (disables its select). */
  protected readonly roleChangePending = signal<string | null>(null);

  protected readonly filtered = computed(() => filterMembers(this.members(), this.query()));
  protected readonly canManage = computed(
    () => this.principal.isSuperadmin() || this.principal.role() === 'tenant_admin',
  );

  protected readonly roleOptions = INVITABLE_ROLE_OPTIONS;
  protected readonly memberLabel = memberLabel;
  protected readonly memberInitial = memberInitial;
  protected readonly roleChipKind = roleChipKind;
  protected readonly statusChipKind = statusChipKind;

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.principal.init();
    effect((onCleanup) => {
      const tenantId = this.tenantId();
      const signedIn = this.authStatus() === 'signedIn';
      if (!this.firestore || !signedIn || !tenantId) {
        this.members.set([]);
        this.membersLoading.set(false);
        return;
      }
      this.membersLoading.set(true);
      const unsubscribe = onSnapshot(
        membersCol(this.firestore, tenantId),
        (snapshot) => {
          this.members.set(sortMembers(snapshot.docs.map((doc) => doc.data())));
          this.membersLoading.set(false);
        },
        (error) => {
          this.membersLoading.set(false);
          this.showToast('negative', `Could not load members: ${error.message}`);
        },
      );
      onCleanup(unsubscribe);
    });
  }

  /** True when the current admin may change this row's role (never their own). */
  protected canChangeRole(member: Member): boolean {
    return this.canManage() && member.uid !== this.principal.uid();
  }

  protected isSelf(member: Member): boolean {
    return member.uid === this.principal.uid();
  }

  protected onInvited(member: Member): void {
    // Optimistic insert; the snapshot listener reconciles with the server doc.
    this.members.update((members) => upsertMember(members, member));
    this.showToast('positive', `Invite sent to ${member.email}.`);
  }

  protected async changeRole(member: Member, role: Role): Promise<void> {
    if (role === member.role || !this.canChangeRole(member)) return;
    const previous = this.members();
    this.roleChangePending.set(member.uid);
    // Optimistic update, rolled back below if the callable rejects.
    this.members.update((members) => upsertMember(members, { ...member, role }));
    try {
      await this.api.setUserRole({ uid: member.uid, role, tenantId: member.tenantId });
      this.showToast('positive', `${memberLabel(member)} is now ${this.roleLabel(role)}.`);
    } catch (err) {
      this.members.set(previous);
      this.showToast(
        'negative',
        err instanceof Error ? err.message : 'Role change failed. Please try again.',
      );
    } finally {
      this.roleChangePending.set(null);
    }
  }

  protected roleLabel(role: Role): string {
    return this.roleOptions.find((o) => o.value === role)?.label ?? role;
  }

  private showToast(kind: Toast['kind'], text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ kind, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
  }
}
