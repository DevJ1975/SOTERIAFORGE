import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import {
  type ApiBadgeDefinition,
  type BadgeInput,
  type BadgeKind,
  type BadgeRule,
  GamificationAdminApi,
  gamificationAdminErrorMessage,
} from '@assurance/lms-core';
import { type ApiMember, MemberAdminService } from '@assurance/tenant';

const ICONS = [
  'badge-recruit',
  'badge-operator',
  'badge-analyst',
  'badge-shield',
  'badge-shield-check',
  'users-crew',
] as const;

const KIND_OPTIONS: { label: string; value: BadgeKind }[] = [
  { label: 'Mission (earned automatically)', value: 'mission' },
  { label: 'Credential (instructor sign-off)', value: 'credential' },
];

const RULE_OPTIONS: { label: string; value: BadgeRule }[] = [
  { label: 'Lessons completed', value: 'lessons_completed' },
  { label: 'Courses completed', value: 'course_completed' },
  { label: 'Graded quizzes passed', value: 'quizzes_passed' },
  { label: 'Pulse streak (days)', value: 'streak_days' },
  { label: 'Level reached', value: 'level' },
  { label: 'Total XP', value: 'xp_total' },
  { label: 'Instructor sign-off (manual)', value: 'manual' },
];

const ICON_OPTIONS = ICONS.map((i) => ({ label: i, value: i }));

function emptyForm(): BadgeInput {
  return {
    key: '',
    name: '',
    description: '',
    icon: ICONS[0],
    kind: 'mission',
    rule: 'lessons_completed',
    target: 1,
    order: 0,
    active: true,
  };
}

@Component({
  selector: 'assurance-admin-badges',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, SelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="badges">
      <h1>Badges</h1>

      <!-- Badge Form (create or edit) -->
      <div class="badges__form">
        <h2>{{ editingId() ? 'Edit Badge' : 'New Badge' }}</h2>
        <div class="badges__form-row">
          <input
            pInputText
            type="text"
            placeholder="Key (slug)"
            [(ngModel)]="form.key"
            aria-label="Badge key"
          />
          <input
            pInputText
            type="text"
            placeholder="Name"
            [(ngModel)]="form.name"
            aria-label="Badge name"
          />
          <input
            pInputText
            type="text"
            placeholder="Description"
            [(ngModel)]="form.description"
            aria-label="Badge description"
          />
        </div>
        <div class="badges__form-row">
          <p-select
            [options]="iconOptions"
            [(ngModel)]="form.icon"
            optionLabel="label"
            optionValue="value"
            aria-label="Icon"
          />
          <p-select
            [options]="kindOptions"
            [ngModel]="form.kind"
            (ngModelChange)="setKind($event)"
            optionLabel="label"
            optionValue="value"
            aria-label="Kind"
          />
          <p-select
            [options]="ruleOptions"
            [(ngModel)]="form.rule"
            optionLabel="label"
            optionValue="value"
            [disabled]="form.kind === 'credential'"
            aria-label="Rule"
          />
          @if (form.rule !== 'manual') {
            <label class="badges__field">
              Target
              <input pInputText type="number" min="1" [(ngModel)]="form.target" />
            </label>
          }
          <label class="badges__field">
            Order
            <input pInputText type="number" min="0" [(ngModel)]="form.order" />
          </label>
          <label class="badges__check">
            <input type="checkbox" [(ngModel)]="form.active" />
            Active
          </label>
        </div>
        <div class="badges__form-row">
          <p-button
            [label]="editingId() ? 'Save Badge' : 'Create Badge'"
            [loading]="saving()"
            [disabled]="!form.key.trim() || !form.name.trim()"
            (onClick)="save()"
          />
          @if (editingId()) {
            <p-button label="Cancel" severity="secondary" (onClick)="cancelEdit()" />
          }
        </div>
        @if (formError()) {
          <p class="badges__error" role="alert">{{ formError() }}</p>
        }
      </div>

      @if (actionError()) {
        <p class="badges__error" role="alert">{{ actionError() }}</p>
      }
      @if (retireOffer(); as offer) {
        <p class="badges__offer">
          {{ offer.name }} can't be deleted because members hold it.
          <p-button
            label="Retire"
            severity="secondary"
            size="small"
            [attr.aria-label]="'Retire ' + offer.name + ' instead'"
            (onClick)="setActive(offer, false)"
          />
        </p>
      }

      <!-- Sign-off panel -->
      @if (signOffBadge(); as badge) {
        <div class="badges__form">
          <h2>Sign off: {{ badge.name }}</h2>
          <div class="badges__form-row">
            <p-select
              [options]="learners()"
              [(ngModel)]="signOffMemberId"
              optionValue="id"
              optionLabel="displayName"
              placeholder="Choose a learner"
              [filter]="true"
              aria-label="Learner"
            />
            <p-button
              label="Award"
              [loading]="awarding()"
              [disabled]="!signOffMemberId"
              (onClick)="award()"
            />
            <p-button label="Close" severity="secondary" (onClick)="closeSignOff()" />
          </div>
          @if (signOffError()) {
            <p class="badges__error" role="alert">{{ signOffError() }}</p>
          }
          @if (signOffDone()) {
            <p class="badges__ok" role="status">{{ signOffDone() }}</p>
          }
        </div>
      }

      <!-- Badges Table -->
      @if (loading()) {
        <p>Loading badges…</p>
      } @else if (loadError()) {
        <p class="badges__error" role="alert">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="badges()"
          [paginator]="badges().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Rule</th>
              <th>Target</th>
              <th>State</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-b>
            <tr>
              <td>
                {{ b.name }}
                <span class="badges__key">{{ b.key }}</span>
              </td>
              <td>{{ b.kind }}</td>
              <td>{{ b.rule }}</td>
              <td>{{ b.rule === 'manual' ? '—' : b.target }}</td>
              <td>{{ b.active ? 'Active' : 'Retired' }}</td>
              <td>
                <div class="badges__row-actions">
                  <p-button
                    label="Edit"
                    severity="secondary"
                    size="small"
                    [attr.aria-label]="'Edit ' + b.name"
                    (onClick)="edit(b)"
                  />
                  @if (b.rule === 'manual' && b.active) {
                    <p-button
                      label="Sign off"
                      size="small"
                      [attr.aria-label]="'Sign off ' + b.name"
                      (onClick)="openSignOff(b)"
                    />
                  }
                  @if (b.active) {
                    <p-button
                      label="Retire"
                      severity="secondary"
                      size="small"
                      [attr.aria-label]="'Retire ' + b.name"
                      (onClick)="setActive(b, false)"
                    />
                  } @else {
                    <p-button
                      label="Reactivate"
                      severity="secondary"
                      size="small"
                      [attr.aria-label]="'Reactivate ' + b.name"
                      (onClick)="setActive(b, true)"
                    />
                  }
                  @if (confirmDeleteId() === b.id) {
                    <p-button
                      label="Confirm delete"
                      severity="danger"
                      size="small"
                      [attr.aria-label]="'Confirm delete ' + b.name"
                      (onClick)="remove(b)"
                    />
                    <p-button
                      label="Cancel"
                      severity="secondary"
                      size="small"
                      (onClick)="confirmDeleteId.set(null)"
                    />
                  } @else {
                    <p-button
                      label="Delete"
                      severity="danger"
                      size="small"
                      [attr.aria-label]="'Delete ' + b.name"
                      (onClick)="confirmDeleteId.set(b.id)"
                    />
                  }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6">No badges found. Create your first badge above.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .badges {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .badges__form {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .badges__form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .badges__field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.875rem;
      }
      .badges__check {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      .badges__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .badges__ok {
        color: #166534;
        margin-top: 0.5rem;
      }
      .badges__offer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .badges__key {
        color: #6b7280;
        font-size: 0.8125rem;
        margin-left: 0.5rem;
      }
      .badges__row-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class BadgesComponent implements OnInit {
  private readonly api = inject(GamificationAdminApi);
  private readonly memberAdmin = inject(MemberAdminService);

  protected readonly iconOptions = ICON_OPTIONS;
  protected readonly kindOptions = KIND_OPTIONS;
  protected readonly ruleOptions = RULE_OPTIONS;

  protected readonly badges = signal<ApiBadgeDefinition[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly confirmDeleteId = signal<string | null>(null);
  /** Set when a delete was refused because members hold the badge. */
  protected readonly retireOffer = signal<ApiBadgeDefinition | null>(null);

  protected readonly signOffBadge = signal<ApiBadgeDefinition | null>(null);
  protected readonly learners = signal<ApiMember[]>([]);
  protected readonly awarding = signal(false);
  protected readonly signOffError = signal<string | null>(null);
  protected readonly signOffDone = signal<string | null>(null);

  protected form: BadgeInput = emptyForm();
  protected signOffMemberId: string | null = null;

  ngOnInit(): void {
    void this.loadBadges();
  }

  private async loadBadges(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.badges.set(await this.api.badges());
    } catch (err) {
      this.loadError.set(gamificationAdminErrorMessage(err, 'Failed to load badges'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Credentials are always signed off by an instructor, so they lock the rule to manual. */
  protected setKind(kind: BadgeKind): void {
    this.form.kind = kind;
    if (kind === 'credential') this.form.rule = 'manual';
  }

  protected edit(badge: ApiBadgeDefinition): void {
    const { id, ...fields } = badge;
    this.editingId.set(id);
    this.form = { ...fields };
    this.formError.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.form = emptyForm();
    this.formError.set(null);
  }

  protected async save(): Promise<void> {
    if (!this.form.key.trim() || !this.form.name.trim()) return;
    const input: BadgeInput = {
      ...this.form,
      key: this.form.key.trim(),
      name: this.form.name.trim(),
      // A manual badge has no threshold; the API still wants a valid target.
      target: this.form.rule === 'manual' ? 1 : Math.max(1, Math.floor(this.form.target || 1)),
      order: Math.max(0, Math.floor(this.form.order || 0)),
    };
    this.saving.set(true);
    this.formError.set(null);
    try {
      const id = this.editingId();
      if (id) await this.api.updateBadge(id, input);
      else await this.api.createBadge(input);
      this.cancelEdit();
      await this.loadBadges();
    } catch (err) {
      this.formError.set(gamificationAdminErrorMessage(err, 'Failed to save the badge'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async setActive(badge: ApiBadgeDefinition, active: boolean): Promise<void> {
    this.actionError.set(null);
    this.retireOffer.set(null);
    this.confirmDeleteId.set(null);
    try {
      await this.api.updateBadge(badge.id, { active });
    } catch (err) {
      this.actionError.set(gamificationAdminErrorMessage(err, 'Failed to update the badge'));
    }
    await this.loadBadges();
  }

  protected async remove(badge: ApiBadgeDefinition): Promise<void> {
    this.actionError.set(null);
    this.retireOffer.set(null);
    this.confirmDeleteId.set(null);
    try {
      await this.api.deleteBadge(badge.id);
    } catch (err) {
      this.actionError.set(gamificationAdminErrorMessage(err, 'Failed to delete the badge'));
      // The API refuses (400) when members hold the badge: offer to retire it instead.
      if (badge.active && err instanceof HttpErrorResponse && err.status === 400) {
        this.retireOffer.set(badge);
      }
    }
    await this.loadBadges();
  }

  protected async openSignOff(badge: ApiBadgeDefinition): Promise<void> {
    this.signOffBadge.set(badge);
    this.signOffMemberId = null;
    this.signOffError.set(null);
    this.signOffDone.set(null);
    try {
      const members = await this.memberAdmin.listMembers();
      this.learners.set(
        members
          .filter((m) => m.role === 'learner' && m.status === 'active')
          .map((m) => ({ ...m, displayName: m.displayName || m.email })),
      );
    } catch (err) {
      this.signOffError.set(gamificationAdminErrorMessage(err, 'Failed to load learners'));
    }
  }

  protected closeSignOff(): void {
    this.signOffBadge.set(null);
  }

  protected async award(): Promise<void> {
    const badge = this.signOffBadge();
    const memberId = this.signOffMemberId;
    if (!badge || !memberId) return;
    this.awarding.set(true);
    this.signOffError.set(null);
    this.signOffDone.set(null);
    try {
      await this.api.awardBadge(badge.id, memberId);
      const who = this.learners().find((m) => m.id === memberId)?.displayName ?? 'the learner';
      this.signOffDone.set(`${badge.name} signed off for ${who}.`);
      this.signOffMemberId = null;
    } catch (err) {
      this.signOffError.set(gamificationAdminErrorMessage(err, 'Failed to sign off the badge'));
    } finally {
      this.awarding.set(false);
    }
  }
}
