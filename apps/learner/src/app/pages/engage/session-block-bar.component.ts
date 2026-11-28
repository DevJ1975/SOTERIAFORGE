import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ENGAGE_CONTROLS } from './engage-styles';
import { type SessionState, longClock, stageRemainingMs } from './engage-session.model';

/** The 30-minute block: its stages in order, which one is running and the time left in it. */
@Component({
  selector: 'assurance-session-block-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-pane' },
  template: `
    <div class="eg-head">
      <h3 id="bb-h">{{ totalMinutes() }}-minute block</h3>
      <p class="eg-sub">
        Block {{ state().block.index }} of {{ state().block.count }} ·
        <span class="eg-gold" aria-hidden="true">{{ left() }}</span>
        <span class="sf-visually-hidden">{{ current()?.label }} stage</span>
      </p>
    </div>
    <ol class="sf-stage" aria-labelledby="bb-h">
      @for (stage of state().block.stages; track stage.key; let i = $index) {
        <li
          class="sf-stage__step"
          [class.is-current]="i === state().block.stageIndex"
          [class.is-done]="i < state().block.stageIndex"
          [attr.aria-current]="i === state().block.stageIndex ? 'step' : null"
        >
          <span>{{ stage.label }}</span>
          <small>{{ stage.minutes }} min · {{ status(i) }}</small>
        </li>
      }
    </ol>
  `,
  styles: [
    ENGAGE_CONTROLS,
    `
      ol {
        margin: 0;
        padding: 0;
        list-style: none;
        flex-wrap: wrap;
      }
      .sf-stage__step {
        min-width: 5.5rem;
        text-transform: uppercase;
      }
      .sf-stage__step small {
        text-transform: none;
      }
    `,
  ],
})
export class SessionBlockBarComponent {
  readonly state = input.required<SessionState>();
  /** Server time in milliseconds. */
  readonly now = input.required<number>();

  protected readonly current = computed(
    () => this.state().block.stages[this.state().block.stageIndex],
  );
  protected readonly totalMinutes = computed(() =>
    this.state().block.stages.reduce((sum, stage) => sum + stage.minutes, 0),
  );
  protected readonly left = computed(() => longClock(stageRemainingMs(this.state(), this.now())));

  /** The stage's state in a word, so it is never carried by colour alone. */
  protected status(index: number): string {
    const at = this.state().block.stageIndex;
    return index < at ? 'done' : index === at ? 'now' : 'next';
  }
}
