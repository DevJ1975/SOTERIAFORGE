import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import {
  type ApiCohort,
  type ApiCohortTree,
  type ApiCrewNode,
  GamificationAdminApi,
  gamificationAdminErrorMessage,
} from '@assurance/lms-core';
import { type ApiMember, MemberAdminService } from '@assurance/tenant';

@Component({
  selector: 'assurance-admin-cohorts',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cohorts">
      <h1>Cohorts &amp; crews</h1>

      <!-- New Cohort Form -->
      <div class="cohorts__new-form">
        <h2>New Cohort</h2>
        <div class="cohorts__form-row">
          <input
            pInputText
            type="text"
            placeholder="Cohort name"
            [(ngModel)]="newName"
            aria-label="Cohort name"
          />
          <label class="cohorts__date">
            Starts
            <input pInputText type="date" [(ngModel)]="newStartsOn" />
          </label>
          <label class="cohorts__date">
            Ends
            <input pInputText type="date" [(ngModel)]="newEndsOn" />
          </label>
          <p-button
            label="Create Cohort"
            [loading]="creating()"
            [disabled]="!newName.trim()"
            (onClick)="createCohort()"
          />
        </div>
        @if (createError()) {
          <p class="cohorts__error" role="alert">{{ createError() }}</p>
        }
      </div>

      <!-- Cohorts Table -->
      @if (loading()) {
        <p>Loading cohorts…</p>
      } @else if (loadError()) {
        <p class="cohorts__error" role="alert">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="cohorts()"
          [paginator]="cohorts().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Starts</th>
              <th>Ends</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td>{{ c.name }}</td>
              <td>{{ c.startsOn || '—' }}</td>
              <td>{{ c.endsOn || '—' }}</td>
              <td class="cohorts__actions">
                <p-button
                  label="Open"
                  severity="secondary"
                  size="small"
                  [attr.aria-label]="'Open cohort ' + c.name"
                  (onClick)="open(c)"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4">No cohorts found. Create your first cohort above.</td>
            </tr>
          </ng-template>
        </p-table>
      }

      <!-- Selected Cohort -->
      @if (treeLoading()) {
        <p>Loading cohort…</p>
      }
      @if (actionError()) {
        <p class="cohorts__error" role="alert">{{ actionError() }}</p>
      }
      @if (tree(); as t) {
        <div class="cohorts__detail">
          <h2>{{ t.name }}</h2>
          <p class="cohorts__meta">
            {{ t.sections.length }} sections · {{ crewCount(t) }} crews · {{ rosterCount(t) }}
            learners assigned
          </p>

          <div class="cohorts__form-row">
            <input
              pInputText
              type="text"
              placeholder="Section name"
              [(ngModel)]="newSection"
              aria-label="Section name"
            />
            <p-button
              label="Add Section"
              severity="secondary"
              [disabled]="!newSection.trim()"
              (onClick)="addSection()"
            />
          </div>

          @for (section of t.sections; track section.id) {
            <section class="cohorts__section" [attr.aria-label]="'Section ' + section.name">
              <h3>{{ section.name }}</h3>
              <div class="cohorts__form-row">
                <input
                  pInputText
                  type="text"
                  placeholder="Crew name"
                  [ngModel]="crewDraft(section.id)"
                  (ngModelChange)="setCrewDraft(section.id, $event)"
                  [attr.aria-label]="'New crew name in ' + section.name"
                />
                <p-button
                  label="Add Crew"
                  severity="secondary"
                  size="small"
                  [disabled]="!crewDraft(section.id).trim()"
                  (onClick)="addCrew(section.id)"
                />
              </div>

              @for (crew of section.crews; track crew.id) {
                <div class="cohorts__crew">
                  <div class="cohorts__crew-head">
                    <strong>{{ crew.name }}</strong>
                    <span>{{ crew.members.length }} members</span>
                    <p-button
                      [label]="editing() === crew.id ? 'Cancel' : 'Edit roster'"
                      severity="secondary"
                      size="small"
                      [attr.aria-label]="
                        (editing() === crew.id ? 'Cancel editing ' : 'Edit roster for ') + crew.name
                      "
                      [attr.aria-expanded]="editing() === crew.id"
                      (onClick)="toggleEdit(crew)"
                    />
                  </div>
                  @if (editing() !== crew.id) {
                    <p class="cohorts__roster">
                      {{ memberNames(crew) || 'No learners assigned yet.' }}
                    </p>
                  } @else {
                    <fieldset class="cohorts__picker">
                      <legend>Learners in {{ crew.name }}</legend>
                      @for (m of learners(); track m.id) {
                        <label class="cohorts__learner">
                          <input
                            type="checkbox"
                            [checked]="selected().has(m.id)"
                            (change)="toggleLearner(m.id)"
                          />
                          {{ m.displayName || m.email }}
                          @if (otherCrew(m.id, crew.id); as other) {
                            <span class="cohorts__hint"
                              >(now in {{ other }}; saving moves them)</span
                            >
                          }
                        </label>
                      } @empty {
                        <p>No active learners to assign.</p>
                      }
                    </fieldset>
                    <p-button
                      label="Save roster"
                      size="small"
                      [loading]="saving()"
                      (onClick)="saveRoster(crew)"
                    />
                  }
                </div>
              } @empty {
                <p class="cohorts__meta">No crews yet.</p>
              }
            </section>
          } @empty {
            <p class="cohorts__meta">No sections yet. Add one above, then add crews to it.</p>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .cohorts {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .cohorts__new-form,
      .cohorts__detail {
        background: var(--assurance-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .cohorts__detail {
        margin-top: 2rem;
      }
      .cohorts__form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .cohorts__date {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.875rem;
      }
      .cohorts__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .cohorts__actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .cohorts__meta,
      .cohorts__hint {
        color: #6b7280;
        font-size: 0.875rem;
      }
      .cohorts__section {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid #e5e7eb;
      }
      .cohorts__crew {
        margin-top: 1rem;
        padding: 0.75rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
      }
      .cohorts__crew-head {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      .cohorts__roster {
        margin: 0.5rem 0 0;
      }
      .cohorts__picker {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
        gap: 0.5rem;
        margin: 0.75rem 0;
        padding: 0.75rem;
        border: 1px solid #e5e7eb;
        border-radius: 0.375rem;
      }
      .cohorts__learner {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
    `,
  ],
})
export class CohortsComponent implements OnInit {
  private readonly api = inject(GamificationAdminApi);
  private readonly memberAdmin = inject(MemberAdminService);

  protected readonly cohorts = signal<ApiCohort[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected readonly tree = signal<ApiCohortTree | null>(null);
  protected readonly treeLoading = signal(false);
  protected readonly actionError = signal<string | null>(null);
  protected readonly learners = signal<ApiMember[]>([]);

  /** The crew whose roster is being edited, and the learner ids ticked for it. */
  protected readonly editing = signal<string | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly saving = signal(false);
  private readonly crewDrafts = signal<Record<string, string>>({});

  protected newName = '';
  protected newStartsOn = '';
  protected newEndsOn = '';
  protected newSection = '';

  ngOnInit(): void {
    void this.loadCohorts();
  }

  private async loadCohorts(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.cohorts.set(await this.api.cohorts());
    } catch (err) {
      this.loadError.set(gamificationAdminErrorMessage(err, 'Failed to load cohorts'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async createCohort(): Promise<void> {
    if (!this.newName.trim()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const cohort = await this.api.createCohort({
        name: this.newName.trim(),
        startsOn: this.newStartsOn || null,
        endsOn: this.newEndsOn || null,
      });
      this.newName = '';
      this.newStartsOn = '';
      this.newEndsOn = '';
      await this.loadCohorts();
      await this.open(cohort);
    } catch (err) {
      this.createError.set(gamificationAdminErrorMessage(err, 'Failed to create cohort'));
    } finally {
      this.creating.set(false);
    }
  }

  protected async open(cohort: ApiCohort): Promise<void> {
    this.editing.set(null);
    this.actionError.set(null);
    this.treeLoading.set(true);
    try {
      const [tree, members] = await Promise.all([
        this.api.cohort(cohort.id),
        this.memberAdmin.listMembers(),
      ]);
      this.learners.set(members.filter((m) => m.role === 'learner' && m.status === 'active'));
      this.tree.set(tree);
    } catch (err) {
      this.tree.set(null);
      this.actionError.set(gamificationAdminErrorMessage(err, 'Failed to load the cohort'));
    } finally {
      this.treeLoading.set(false);
    }
  }

  protected async addSection(): Promise<void> {
    const tree = this.tree();
    if (!tree || !this.newSection.trim()) return;
    await this.run(async () => {
      await this.api.createSection(tree.id, this.newSection.trim());
      this.newSection = '';
    }, 'Failed to add the section');
  }

  protected crewDraft(sectionId: string): string {
    return this.crewDrafts()[sectionId] ?? '';
  }

  protected setCrewDraft(sectionId: string, value: string): void {
    this.crewDrafts.update((d) => ({ ...d, [sectionId]: value }));
  }

  protected async addCrew(sectionId: string): Promise<void> {
    const name = this.crewDraft(sectionId).trim();
    if (!name) return;
    await this.run(async () => {
      await this.api.createCrew(sectionId, name);
      this.setCrewDraft(sectionId, '');
    }, 'Failed to add the crew');
  }

  protected toggleEdit(crew: ApiCrewNode): void {
    if (this.editing() === crew.id) {
      this.editing.set(null);
      return;
    }
    this.actionError.set(null);
    this.selected.set(new Set(crew.members.map((m) => m.id)));
    this.editing.set(crew.id);
  }

  protected toggleLearner(memberId: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (!next.delete(memberId)) next.add(memberId);
      return next;
    });
  }

  protected async saveRoster(crew: ApiCrewNode): Promise<void> {
    const ids = [...this.selected()];
    // Replacing a roster clears leads server-side, so send back the leads who stay.
    const leads = crew.members.filter((m) => m.isLead && ids.includes(m.id)).map((m) => m.id);
    this.saving.set(true);
    const saved = await this.run(
      () => this.api.setCrewMembers(crew.id, ids, leads),
      'Failed to save the roster',
    );
    this.saving.set(false);
    if (saved) this.editing.set(null);
  }

  /** The name of another crew in this cohort that already holds the learner, if any. */
  protected otherCrew(memberId: string, crewId: string): string | null {
    for (const section of this.tree()?.sections ?? []) {
      for (const crew of section.crews) {
        if (crew.id !== crewId && crew.members.some((m) => m.id === memberId)) return crew.name;
      }
    }
    return null;
  }

  protected memberNames(crew: ApiCrewNode): string {
    return crew.members.map((m) => m.displayName).join(', ');
  }

  protected crewCount(tree: ApiCohortTree): number {
    return tree.sections.reduce((n, s) => n + s.crews.length, 0);
  }

  protected rosterCount(tree: ApiCohortTree): number {
    return tree.sections.reduce((n, s) => n + s.crews.reduce((m, c) => m + c.members.length, 0), 0);
  }

  /** Runs a change, then reloads the tree so it shows the server's truth. */
  private async run(action: () => Promise<unknown>, fallback: string): Promise<boolean> {
    const tree = this.tree();
    if (!tree) return false;
    this.actionError.set(null);
    let ok = true;
    try {
      await action();
    } catch (err) {
      ok = false;
      this.actionError.set(gamificationAdminErrorMessage(err, fallback));
    }
    try {
      this.tree.set(await this.api.cohort(tree.id));
    } catch (err) {
      ok = false;
      this.actionError.set(gamificationAdminErrorMessage(err, 'Failed to reload the cohort'));
    }
    return ok;
  }
}
