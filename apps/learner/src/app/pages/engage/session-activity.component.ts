import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ENGAGE_CONTROLS } from './engage-styles';
import {
  type ActivityOption,
  type SessionActivity,
  activityRemainingMs,
  clock,
  countdownAnnouncement,
  ordinal,
  percent,
} from './engage-session.model';

/**
 * The activity the host has opened: a Threat Hunt (pick the one real attack, against
 * the clock) or a live poll. One choice, sent once; the server stamps the time.
 */
@Component({
  selector: 'assurance-session-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-pane' },
  template: `
    @let a = activity();
    <div class="eg-head">
      <h3 [id]="'act-' + a.id">
        <span class="tag" [class.tag--hunt]="a.kind === 'hunt'">{{
          a.kind === 'hunt' ? 'Threat Hunt' : 'Live poll'
        }}</span>
        {{ a.prompt }}
      </h3>
      @if (a.status === 'open') {
        <span class="sf-timer" aria-hidden="true">{{ timeLeft() }}</span>
      } @else {
        <span class="eg-sub">Closed</span>
      }
    </div>
    <p class="sf-visually-hidden" role="status" aria-live="polite">{{ announcement() }}</p>

    <fieldset [attr.aria-labelledby]="'act-' + a.id" [disabled]="!canAnswer()">
      <div class="options" [class.options--poll]="a.kind === 'poll'">
        @for (option of a.options; track option.id) {
          <label
            class="option"
            [class.is-chosen]="chosen() === option.id"
            [class.is-correct]="a.correctOptionId === option.id"
          >
            <input
              type="radio"
              [name]="'opt-' + a.id"
              [value]="option.id"
              [checked]="chosen() === option.id"
              (change)="choice.set(option.id)"
            />
            <span class="option__label">{{ option.label }}</span>
            @if (option.detail) {
              <span class="option__detail">{{ option.detail }}</span>
            }
            @if (a.correctOptionId === option.id) {
              <span class="option__mark">The real attack</span>
            } @else if (a.myResponse?.optionId === option.id) {
              <span class="option__mark">Your answer</span>
            }
            @if (a.results; as results) {
              <span class="bar" aria-hidden="true">
                <span class="bar__fill" [style.width.%]="share(option)"></span>
              </span>
              <span class="option__pct">{{ share(option) }}%</span>
            }
          </label>
        }
      </div>
    </fieldset>

    <div class="foot">
      @if (canAnswer()) {
        <button
          type="button"
          class="eg-btn eg-btn--primary"
          [disabled]="!choice() || busy()"
          (click)="submit()"
        >
          {{ a.kind === 'hunt' ? 'Submit answer' : 'Send vote' }}
        </button>
      }
      @if (summary(); as line) {
        <p class="eg-sub" role="status">{{ line }}</p>
      }
      @if (a.results; as results) {
        <p class="eg-sub">{{ results.total }} {{ results.total === 1 ? 'answer' : 'answers' }}</p>
      }
    </div>
    <p class="eg-sub note">
      Answers are timestamped by the server. A slow connection never decides a winner.
    </p>
  `,
  styles: [
    ENGAGE_CONTROLS,
    `
      h3 {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .tag {
        padding: 3px 8px;
        border-radius: 6px;
        border: 1px solid var(--sf-dark-line);
        font-size: var(--sf-text-xs, 0.75rem);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .tag--hunt {
        background: #fff;
        border-color: #fff;
        color: var(--sf-ember-on-soft);
      }
      fieldset {
        margin: 0;
        padding: 0;
        border: 0;
        min-width: 0;
      }
      .options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
        gap: 10px;
      }
      .options--poll {
        grid-template-columns: minmax(0, 1fr);
      }
      .option {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 4px 12px;
        min-height: 52px;
        padding: 10px 14px;
        border: 1px solid var(--sf-dark-line);
        border-radius: var(--sf-radius-md, 12px);
        background: var(--sf-dark-inset);
        cursor: pointer;
      }
      .option input {
        width: 20px;
        height: 20px;
        accent-color: var(--sf-ember);
      }
      .option:has(input:focus-visible) {
        outline: 3px solid rgba(220, 72, 27, 0.75);
        outline-offset: 2px;
      }
      .option.is-chosen {
        border-color: var(--sf-ember);
      }
      .option.is-correct {
        border-color: var(--sf-success);
      }
      .option__label {
        color: #fff;
        font-weight: var(--sf-weight-bold, 700);
      }
      .option__detail,
      .option__mark {
        grid-column: 2 / -1;
        font-size: var(--sf-text-sm, 0.875rem);
      }
      .option__mark {
        color: #fff;
        font-weight: var(--sf-weight-semibold, 600);
      }
      .option__pct {
        color: #fff;
        font-variant-numeric: tabular-nums;
      }
      .bar {
        grid-column: 2;
        height: 6px;
        border-radius: 3px;
        background: var(--sf-dark-line);
        overflow: hidden;
      }
      .bar__fill {
        display: block;
        height: 100%;
        background: var(--sf-ember);
        transition: width var(--sf-dur-base, 200ms) var(--sf-ease, ease);
      }
      .foot {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .note {
        margin-top: 10px;
        font-size: var(--sf-text-xs, 0.75rem);
      }
      @media (prefers-reduced-motion: reduce) {
        .bar__fill {
          transition: none;
        }
      }
    `,
  ],
})
export class SessionActivityComponent {
  readonly activity = input.required<SessionActivity>();
  /** Server time in milliseconds. */
  readonly now = input.required<number>();
  readonly busy = input(false);
  readonly respond = output<string>();

  /** The option picked but not yet sent. */
  protected readonly choice = signal('');
  protected readonly announcement = signal('');
  private lastLeft: number | null = null;
  private lastId = '';

  protected readonly remaining = computed(() => activityRemainingMs(this.activity(), this.now()));
  protected readonly timeLeft = computed(() => clock(this.remaining()));
  protected readonly canAnswer = computed(
    () => this.activity().status === 'open' && !this.activity().myResponse && this.remaining() > 0,
  );
  protected readonly chosen = computed(() => this.activity().myResponse?.optionId ?? this.choice());

  protected readonly summary = computed(() => {
    const a = this.activity();
    if (!a.myResponse) {
      return a.status === 'closed' || this.remaining() <= 0 ? 'You did not answer in time.' : '';
    }
    const parts = [`Submitted ${clock(a.myResponse.elapsedMs)}`];
    const result = a.myResult;
    if (result) {
      parts.push(result.correct ? 'Correct' : 'Not the attack');
      if (result.crewRank) parts.push(`${ordinal(result.crewRank)} in crew`);
      if (result.classRank) parts.push(`${ordinal(result.classRank)} in class`);
      if (result.xp) parts.push(`+${result.xp} XP`);
    }
    return parts.join(' · ');
  });

  constructor() {
    // Speak the countdown at a few moments only, never every second.
    effect(() => {
      const a = this.activity();
      const left = this.remaining();
      untracked(() => {
        if (a.id !== this.lastId) {
          this.lastId = a.id;
          this.lastLeft = null;
          this.choice.set('');
        }
        if (a.status === 'closed' && this.lastLeft === null) {
          this.lastLeft = 0; // joined after it closed: nothing to count down
          return;
        }
        const what = a.kind === 'hunt' ? 'Threat Hunt' : 'The poll';
        const said = countdownAnnouncement(this.lastLeft, left, what);
        if (said) this.announcement.set(said);
        this.lastLeft = left;
      });
    });
  }

  protected share(option: ActivityOption): number {
    const results = this.activity().results;
    if (!results) return 0;
    const count = results.counts.find((c) => c.optionId === option.id)?.count ?? 0;
    return percent(count, results.total);
  }

  protected submit(): void {
    if (this.choice() && this.canAnswer()) this.respond.emit(this.choice());
  }
}
