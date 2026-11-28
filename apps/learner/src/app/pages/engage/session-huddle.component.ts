import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ENGAGE_CONTROLS } from './engage-styles';
import type { SessionHuddle } from './engage-session.model';

export const HUDDLE_SAVE_DELAY_MS = 800;
export const HUDDLE_MAX = 2000;

/**
 * The crew's shared notes for this block. Typing saves after a short pause; while the
 * box has unsaved typing, a crewmate's incoming text does not overwrite it.
 */
@Component({
  selector: 'assurance-session-huddle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sf-pane' },
  template: `
    <div class="eg-head">
      <h3><label for="huddle-notes">Crew huddle notes</label></h3>
      <span class="eg-sub" role="status">{{ status() }}</span>
    </div>
    <textarea
      id="huddle-notes"
      class="eg-input"
      rows="5"
      [maxLength]="max"
      [readOnly]="!huddle().canEdit"
      [attr.aria-describedby]="'huddle-help'"
      [value]="text()"
      (input)="typed($any($event.target).value)"
      (blur)="flush()"
    ></textarea>
    <p class="eg-sub" id="huddle-help">
      @if (huddle().canEdit) {
        Shared with your crew and your instructor. {{ max - text().length }} characters left.
      } @else {
        Your crew lead is taking the notes for this block. You can read them here.
      }
    </p>
  `,
  styles: [
    ENGAGE_CONTROLS,
    `
      textarea {
        width: 100%;
        resize: vertical;
        line-height: 1.5;
      }
      textarea[readonly] {
        opacity: 0.85;
      }
      #huddle-help {
        margin-top: 8px;
        font-size: var(--sf-text-xs, 0.75rem);
      }
    `,
  ],
})
export class SessionHuddleComponent implements OnDestroy {
  readonly huddle = input.required<SessionHuddle>();
  /** Emits the text to save, after the typing pause. */
  readonly save = output<string>();

  protected readonly max = HUDDLE_MAX;
  protected readonly text = signal('');
  private readonly dirty = signal(false);
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly status = () => {
    if (this.dirty()) return 'Saving…';
    const h = this.huddle();
    if (!h.updatedAt) return '';
    return h.updatedByName ? `Saved · last edit by ${h.updatedByName}` : 'Saved';
  };

  constructor() {
    effect(() => {
      const incoming = this.huddle().text;
      untracked(() => {
        if (!this.dirty()) this.text.set(incoming);
      });
    });
  }

  protected typed(value: string): void {
    this.text.set(value.slice(0, HUDDLE_MAX));
    this.dirty.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), HUDDLE_SAVE_DELAY_MS);
  }

  /** Save now (the pause elapsed, or focus left the box). */
  protected flush(): void {
    clearTimeout(this.timer);
    if (!this.dirty()) return;
    this.dirty.set(false);
    this.save.emit(this.text());
  }

  ngOnDestroy(): void {
    this.flush();
  }
}
