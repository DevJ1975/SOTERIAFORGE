import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Cmi5LauncherComponent } from './cmi5-launcher.component';
import { StandardsApi, type AuLaunch, type StandardsCompletion } from './standards-api';

/** How often the host asks the API what the content has reported. */
export const AU_POLL_MS = 3000;

/**
 * Launches a `cmi5` or `unity` lesson as a cmi5 Assignable Unit.
 *
 * The content reports straight to the API with its own session token
 * (docs/unity-cmi5-contract.md); this component never sees or relays statements.
 * It only polls the session so the lesson page can show the result.
 */
@Component({
  selector: 'assurance-managed-cmi5-player',
  standalone: true,
  imports: [Cmi5LauncherComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (launching()) {
      <p role="status">Opening lesson...</p>
    }
    @if (!launch() && !launching()) {
      <button type="button" class="sf-btn sf-btn--secondary" (click)="start()">Open lesson</button>
    }
    @if (launch(); as l) {
      <assurance-cmi5-launcher
        [auUrl]="l.auUrl"
        [endpoint]="l.endpoint"
        [fetch]="l.fetch"
        [actor]="l.actor"
        [registration]="l.registration"
        [activityId]="l.activityId"
      />
      <p role="status">{{ status() }}</p>
    }
  `,
})
export class ManagedCmi5PlayerComponent {
  readonly lessonId = input.required<string>();
  readonly completed = output<StandardsCompletion>();
  protected readonly launch = signal<AuLaunch | null>(null);
  protected readonly launching = signal(false);
  protected readonly error = signal('');
  protected readonly status = signal('');
  private readonly api = inject(StandardsApi);
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private reported = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset());
    effect(() => {
      this.lessonId();
      this.reset();
    });
  }

  private reset(): void {
    this.generation++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.reported = '';
    this.launch.set(null);
    this.launching.set(false);
    this.error.set('');
    this.status.set('');
  }

  protected async start(): Promise<void> {
    if (this.launching()) return;
    this.reset();
    const generation = this.generation;
    this.launching.set(true);
    try {
      const launch = await this.api.cmi5Launch(this.lessonId());
      const url = new URL(launch.auUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.origin === window.location.origin) {
        throw new Error('The API returned an invalid content launch.');
      }
      if (generation !== this.generation) return;
      this.launch.set(launch);
      this.schedule(launch.id, generation);
    } catch (error) {
      if (generation === this.generation) {
        this.error.set(error instanceof Error ? error.message : 'Could not open this lesson.');
      }
    } finally {
      if (generation === this.generation) this.launching.set(false);
    }
  }

  private schedule(sessionId: string, generation: number): void {
    this.timer = setTimeout(() => void this.poll(sessionId, generation), AU_POLL_MS);
  }

  private async poll(sessionId: string, generation: number): Promise<void> {
    let active = true;
    try {
      const session = await this.api.cmi5Session(sessionId);
      if (generation !== this.generation) return;
      active = session.active;
      if (session.completion) {
        // A later `passed` updates the score, so report every change once.
        const key = JSON.stringify(session.completion);
        if (key !== this.reported) {
          this.reported = key;
          this.completed.emit(session.completion);
        }
        this.status.set('Lesson complete. Your progress is saved.');
      } else if (session.success === false) {
        this.status.set('Not passed yet. You can try again.');
      } else if (!active) {
        this.status.set('This session has ended. Open the lesson again to continue.');
      }
    } catch {
      // A missed poll is harmless: the content reports to the API on its own.
    }
    if (generation === this.generation && active) this.schedule(sessionId, generation);
  }
}
