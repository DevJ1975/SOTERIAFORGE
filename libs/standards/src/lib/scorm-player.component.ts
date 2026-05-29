import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ScormRuntimeService, ScormVersion } from './scorm-runtime.service';

/**
 * ScormPlayerComponent
 *
 * Renders a SCORM SCO (Shareable Content Object) inside a sandboxed, responsive
 * iframe. On initialisation (browser only) it mounts the SCORM API on `window`
 * via `ScormRuntimeService` *before* the iframe URL is set, so that the SCO can
 * find the API as soon as it loads.
 *
 * Runtime events are forwarded via two outputs:
 * - `commit`    — emits the raw CMI state on every SCORM commit.
 * - `completed` — emits `{completed: true, score?}` when the SCO finishes.
 *
 * Selector: `forge-scorm-player`
 */
@Component({
  selector: 'forge-scorm-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-scorm-player__wrapper">
      <iframe
        #scormFrame
        class="forge-scorm-player__frame"
        title="SCORM content"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        allowfullscreen
      ></iframe>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .forge-scorm-player__wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 4px;
        overflow: hidden;
      }
      .forge-scorm-player__frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
    `,
  ],
})
export class ScormPlayerComponent implements OnDestroy {
  // ---------------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------------

  /** The SCO's launch URL (e.g. `https://cdn.example.com/course/index.html`). */
  readonly launchUrl = input.required<string>();

  /** SCORM specification version. Defaults to `'2004'`. */
  readonly scormVersion = input<ScormVersion>('2004');

  /**
   * Seed CMI data to resume a previous session.
   * Pass the value previously received from the `commit` output.
   */
  readonly initialCmi = input<Record<string, unknown> | undefined>(undefined);

  // ---------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------

  /** Emits the current CMI state on every SCORM commit. */
  readonly commit = output<Record<string, unknown>>();

  /** Emits completion status and optional score when the SCO finishes. */
  readonly completed = output<{ completed: boolean; score?: number }>();

  // ---------------------------------------------------------------------------
  // Private state
  // ---------------------------------------------------------------------------

  @ViewChild('scormFrame') private readonly frameRef?: ElementRef<HTMLIFrameElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly runtime = inject(ScormRuntimeService);

  // ---------------------------------------------------------------------------
  // Constructor / lifecycle
  // ---------------------------------------------------------------------------

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      void this._mount();
    });
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.runtime.terminate();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _mount(): Promise<void> {
    // 1. Initialise the SCORM API on window BEFORE the iframe loads content.
    await this.runtime.initialize({
      version: this.scormVersion(),
      initialCmi: this.initialCmi(),
      persist: (cmi) => {
        this.commit.emit(cmi);

        // Mirror score/completion signals from the service to the output.
        const score = this.runtime.score();
        const isCompleted = this.runtime.completed();
        if (isCompleted) {
          this.completed.emit({
            completed: true,
            ...(score !== null ? { score } : {}),
          });
        }
      },
    });

    // 2. Now point the iframe at the SCO — the SCORM API is already on window.
    // We set `src` imperatively so that the SCORM window API is mounted before
    // the content begins loading.  Direct DOM assignment bypasses Angular
    // template sanitisation, which is intentional: the URL originates from the
    // platform's own content-management layer and is validated upstream.
    const frame = this.frameRef?.nativeElement;
    if (frame) {
      frame.src = this.launchUrl();
    }
  }
}
