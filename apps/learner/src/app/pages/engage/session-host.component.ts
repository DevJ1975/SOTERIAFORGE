import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ENGAGE_CONTROLS } from './engage-styles';
import type { NewActivityInput, RaisedHand } from './engage-session.model';
import { EngageSessionStore } from './engage-session.store';

interface OptionDraft {
  label: string;
  detail: string;
}

const blank = (): OptionDraft => ({ label: '', detail: '' });
const tf = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' });

/**
 * Host tools: run the session (start, next stage, end), open a poll or Threat Hunt,
 * answer raised hands, moderate, and read attendance. Shown to instructors only; the
 * server checks the role on every call.
 */
@Component({
  selector: 'assurance-session-host',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-pane' },
  template: `
    <div class="eg-head">
      <h3 id="host-h">Host tools</h3>
      @if (store.state(); as s) {
        <span class="eg-sub">{{ s.status === 'live' ? 'Session is live' : 'Session ended' }}</span>
      }
    </div>

    @if (!store.live()) {
      <form class="row" (ngSubmit)="start()">
        <label class="eg-field">
          Blocks in this session
          <input
            class="eg-input"
            type="number"
            name="blocks"
            min="1"
            max="8"
            [ngModel]="blocks()"
            (ngModelChange)="blocks.set($event)"
          />
        </label>
        <button type="submit" class="eg-btn eg-btn--primary" [disabled]="store.busy()">
          Start session
        </button>
      </form>
    } @else {
      <div class="row">
        <button type="button" class="eg-btn" [disabled]="store.busy()" (click)="store.advance()">
          Next stage
        </button>
        @if (openActivity(); as open) {
          <button
            type="button"
            class="eg-btn"
            [disabled]="store.busy()"
            (click)="store.closeActivity(open.id)"
          >
            Close {{ open.kind === 'hunt' ? 'Threat Hunt' : 'poll' }}
          </button>
        }
        @if (confirmEnd()) {
          <span class="confirm" role="group" aria-label="End the session for everyone?">
            <span>End the session for everyone?</span>
            <button type="button" class="eg-btn eg-btn--danger" (click)="end()">End session</button>
            <button type="button" class="eg-btn" (click)="confirmEnd.set(false)">Keep going</button>
          </span>
        } @else {
          <button type="button" class="eg-btn" (click)="confirmEnd.set(true)">End session…</button>
        }
      </div>

      <form class="launch" (ngSubmit)="launch()" aria-labelledby="launch-h">
        <h4 id="launch-h">Start an activity</h4>
        <fieldset class="kinds">
          <legend class="sf-visually-hidden">Kind of activity</legend>
          <label>
            <input
              type="radio"
              name="kind"
              value="hunt"
              [checked]="kind() === 'hunt'"
              (change)="kind.set('hunt')"
            />
            Threat Hunt
          </label>
          <label>
            <input
              type="radio"
              name="kind"
              value="poll"
              [checked]="kind() === 'poll'"
              (change)="kind.set('poll')"
            />
            Live poll
          </label>
        </fieldset>
        <label class="eg-field">
          {{ kind() === 'hunt' ? 'Challenge' : 'Question' }}
          <input
            class="eg-input"
            name="prompt"
            maxlength="200"
            required
            [ngModel]="prompt()"
            (ngModelChange)="prompt.set($event)"
          />
        </label>
        <fieldset class="opts">
          <legend>
            {{ kind() === 'hunt' ? 'Tickets (mark the real attack)' : 'Choices' }}
          </legend>
          @for (option of options(); track $index; let i = $index) {
            <div class="opt">
              @if (kind() === 'hunt') {
                <label class="opt__correct">
                  <input
                    type="radio"
                    name="correct"
                    [checked]="correct() === i"
                    (change)="correct.set(i)"
                  />
                  <span class="sf-visually-hidden">Option {{ i + 1 }} is the real attack</span>
                </label>
              }
              <input
                class="eg-input"
                [attr.name]="'label' + i"
                [ngModelOptions]="{ standalone: true }"
                maxlength="80"
                [attr.aria-label]="'Option ' + (i + 1) + ' label'"
                [ngModel]="option.label"
                (ngModelChange)="edit(i, 'label', $event)"
              />
              <input
                class="eg-input"
                [attr.name]="'detail' + i"
                [ngModelOptions]="{ standalone: true }"
                maxlength="140"
                [attr.aria-label]="'Option ' + (i + 1) + ' detail (optional)'"
                placeholder="Detail (optional)"
                [ngModel]="option.detail"
                (ngModelChange)="edit(i, 'detail', $event)"
              />
              <button
                type="button"
                class="eg-btn"
                [disabled]="options().length <= 2"
                [attr.aria-label]="'Remove option ' + (i + 1)"
                (click)="remove(i)"
              >
                Remove
              </button>
            </div>
          }
          <button type="button" class="eg-btn" [disabled]="options().length >= 8" (click)="add()">
            Add option
          </button>
        </fieldset>
        <div class="row">
          <label class="eg-field">
            Seconds to answer
            <input
              class="eg-input"
              type="number"
              name="seconds"
              min="10"
              max="600"
              [ngModel]="seconds()"
              (ngModelChange)="seconds.set($event)"
            />
          </label>
          @if (kind() === 'hunt') {
            <label class="eg-field">
              XP for the right answer
              <input
                class="eg-input"
                type="number"
                name="xp"
                min="0"
                max="200"
                [ngModel]="xp()"
                (ngModelChange)="xp.set($event)"
              />
            </label>
          }
          <button
            type="submit"
            class="eg-btn eg-btn--primary"
            [disabled]="store.busy() || !!openActivity() || !!problem()"
          >
            Start {{ kind() === 'hunt' ? 'Threat Hunt' : 'poll' }}
          </button>
        </div>
        @if (openActivity()) {
          <p class="eg-sub">Close the open activity before starting another.</p>
        } @else if (problem(); as why) {
          <p class="eg-sub">{{ why }}</p>
        }
      </form>

      <section aria-labelledby="hands-h">
        <h4 id="hands-h">Raised hands ({{ hands().length }})</h4>
        @if (hands().length === 0) {
          <p class="eg-sub">No hands are raised.</p>
        } @else {
          <ul class="people">
            @for (hand of hands(); track hand.memberId) {
              <li>
                <span class="who">{{ hand.name }}</span>
                <span class="eg-sub">raised {{ time(hand.raisedAt) }}</span>
                <span class="row">
                  <button
                    type="button"
                    class="eg-btn"
                    [attr.aria-label]="'Lower hand for ' + hand.name"
                    (click)="store.moderate(hand.memberId, 'lower_hand')"
                  >
                    Lower hand
                  </button>
                  <button
                    type="button"
                    class="eg-btn"
                    [attr.aria-label]="'Mute ' + hand.name"
                    (click)="store.moderate(hand.memberId, 'mute')"
                  >
                    Mute
                  </button>
                  @if (removing() === hand.memberId) {
                    <button
                      type="button"
                      class="eg-btn eg-btn--danger"
                      [attr.aria-label]="'Confirm removing ' + hand.name + ' from the session'"
                      (click)="confirmRemove(hand)"
                    >
                      Confirm remove
                    </button>
                    <button type="button" class="eg-btn" (click)="removing.set('')">Cancel</button>
                  } @else {
                    <button
                      type="button"
                      class="eg-btn"
                      [attr.aria-label]="'Remove ' + hand.name + ' from the session'"
                      (click)="removing.set(hand.memberId)"
                    >
                      Remove…
                    </button>
                  }
                </span>
              </li>
            }
          </ul>
        }
      </section>
    }

    @if (store.sessionId()) {
      <section aria-labelledby="att-h">
        <div class="eg-head">
          <h4 id="att-h">Attendance</h4>
          <button type="button" class="eg-btn" (click)="store.loadAttendance()">
            {{ store.attendance() ? 'Refresh attendance' : 'Show attendance' }}
          </button>
        </div>
        @if (store.attendance(); as rows) {
          @if (rows.length === 0) {
            <p class="eg-sub">Nobody has been recorded in this session yet.</p>
          } @else {
            <div class="scroll" tabindex="0" role="region" aria-labelledby="att-h">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Crew</th>
                    <th scope="col">Joined</th>
                    <th scope="col">Minutes</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows; track row.memberId) {
                    <tr>
                      <th scope="row">
                        {{ row.name }}
                        @if (row.removed) {
                          <span class="eg-sub">· removed</span>
                        }
                      </th>
                      <td>{{ row.crew ?? 'No crew' }}</td>
                      <td>{{ time(row.firstJoinedAt) }}</td>
                      <td>{{ row.minutes }}</td>
                      <td>
                        @if (!row.removed) {
                          <span class="row">
                            <button
                              type="button"
                              class="eg-btn"
                              [attr.aria-label]="'Mute ' + row.name"
                              (click)="store.moderate(row.memberId, 'mute')"
                            >
                              Mute
                            </button>
                            @if (removing() === row.memberId) {
                              <button
                                type="button"
                                class="eg-btn eg-btn--danger"
                                [attr.aria-label]="
                                  'Confirm removing ' + row.name + ' from the session'
                                "
                                (click)="confirmRemove(row)"
                              >
                                Confirm remove
                              </button>
                              <button type="button" class="eg-btn" (click)="removing.set('')">
                                Cancel
                              </button>
                            } @else {
                              <button
                                type="button"
                                class="eg-btn"
                                [attr.aria-label]="'Remove ' + row.name + ' from the session'"
                                (click)="removing.set(row.memberId)"
                              >
                                Remove…
                              </button>
                            }
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </section>
    }
  `,
  styles: [
    ENGAGE_CONTROLS,
    `
      h4 {
        margin: 18px 0 8px;
        color: #fff;
        font-size: var(--sf-text-sm, 0.875rem);
      }
      .eg-head h4 {
        margin: 0;
      }
      section {
        margin-top: 18px;
      }
      .row,
      .confirm,
      .kinds {
        display: flex;
        align-items: end;
        gap: 10px;
        flex-wrap: wrap;
      }
      .confirm {
        align-items: center;
        color: #fff;
      }
      .launch {
        display: grid;
        gap: 12px;
        margin-top: 6px;
      }
      fieldset {
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
      }
      .kinds label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 44px;
        color: #fff;
      }
      .opts {
        display: grid;
        gap: 8px;
      }
      .opts legend {
        margin-bottom: 6px;
        font-size: var(--sf-text-sm, 0.875rem);
      }
      .opt {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.4fr) auto;
        gap: 8px;
        align-items: center;
      }
      .opt__correct {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
      }
      input[type='radio'] {
        width: 20px;
        height: 20px;
        accent-color: var(--sf-ember);
      }
      input[type='number'] {
        width: 7rem;
      }
      .people {
        display: grid;
        gap: 10px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .people li {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .who {
        color: #fff;
        font-weight: var(--sf-weight-semibold, 600);
      }
      .scroll {
        overflow-x: auto;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--sf-text-sm, 0.875rem);
      }
      th,
      td {
        padding: 8px 10px;
        border-top: 1px solid var(--sf-dark-line);
        text-align: left;
      }
      th {
        color: #fff;
      }
      @media (max-width: 40rem) {
        .opt {
          grid-template-columns: auto minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class SessionHostComponent {
  protected readonly store = inject(EngageSessionStore);

  protected readonly blocks = signal(4);
  protected readonly kind = signal<'hunt' | 'poll'>('hunt');
  protected readonly prompt = signal('');
  protected readonly options = signal<OptionDraft[]>([blank(), blank()]);
  protected readonly correct = signal(-1);
  protected readonly seconds = signal(180);
  protected readonly xp = signal(40);
  protected readonly confirmEnd = signal(false);
  /** The member whose removal is waiting for a second, confirming press. */
  protected readonly removing = signal('');

  protected readonly hands = computed<RaisedHand[]>(() => this.store.state()?.hands ?? []);
  protected readonly openActivity = computed(() => {
    const activity = this.store.state()?.activity;
    return activity?.status === 'open' ? activity : null;
  });

  /** Why the activity cannot be started yet, in words; '' when it can. */
  protected readonly problem = computed(() => {
    if (!this.prompt().trim()) {
      return this.kind() === 'hunt' ? 'Write the challenge.' : 'Write the question.';
    }
    const filled = this.filled();
    if (filled.length < 2) return 'Give at least two options a label.';
    if (this.kind() === 'hunt' && !this.options()[this.correct()]?.label.trim()) {
      return 'Mark which ticket is the real attack.';
    }
    const seconds = Number(this.seconds());
    if (!Number.isFinite(seconds) || seconds < 10 || seconds > 600) {
      return 'Time to answer must be between 10 and 600 seconds.';
    }
    return '';
  });

  private filled(): OptionDraft[] {
    return this.options().filter((option) => option.label.trim());
  }

  protected time(iso: string): string {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? '' : tf.format(at);
  }

  protected edit(index: number, field: keyof OptionDraft, value: string): void {
    this.options.update((list) =>
      list.map((option, i) => (i === index ? { ...option, [field]: value } : option)),
    );
  }

  protected add(): void {
    if (this.options().length < 8) this.options.update((list) => [...list, blank()]);
  }

  protected remove(index: number): void {
    if (this.options().length <= 2) return;
    this.options.update((list) => list.filter((_, i) => i !== index));
    this.correct.update((c) => (c === index ? -1 : c > index ? c - 1 : c));
  }

  protected start(): void {
    const blocks = Math.min(8, Math.max(1, Math.round(Number(this.blocks()) || 4)));
    void this.store.startSession({ blocks });
  }

  protected async end(): Promise<void> {
    this.confirmEnd.set(false);
    await this.store.end();
  }

  protected async launch(): Promise<void> {
    if (this.problem() || this.openActivity()) return;
    const kept = this.options()
      .map((option, index) => ({ option, index }))
      .filter(({ option }) => option.label.trim());
    const input: NewActivityInput = {
      kind: this.kind(),
      prompt: this.prompt().trim(),
      options: kept.map(({ option }) => ({
        label: option.label.trim(),
        ...(option.detail.trim() ? { detail: option.detail.trim() } : {}),
      })),
      seconds: Math.round(Number(this.seconds())),
    };
    if (this.kind() === 'hunt') {
      input.correctIndex = kept.findIndex(({ index }) => index === this.correct());
      input.xp = Math.min(200, Math.max(0, Math.round(Number(this.xp()) || 0)));
    }
    if (await this.store.launch(input)) {
      this.prompt.set('');
      this.options.set([blank(), blank()]);
      this.correct.set(-1);
    }
  }

  protected async confirmRemove(person: { memberId: string }): Promise<void> {
    this.removing.set('');
    await this.store.moderate(person.memberId, 'remove');
  }
}
