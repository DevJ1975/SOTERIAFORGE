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
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ScormRuntimeService, ScormVersion } from './scorm-runtime.service';

/**
 * Validate a SCORM launch URL before it is assigned to `iframe.src`.
 *
 * The `src` is set imperatively, bypassing Angular's template sanitiser, under a
 * `allow-scripts allow-same-origin` sandbox — so a hostile `externalUrl`
 * (`z.string().url()`, author-controlled) must be screened here. We resolve the
 * raw value against the current origin and allow **only** `http:`/`https:`,
 * rejecting `javascript:`, `data:`, `blob:`, `file:`, etc. Returns the resolved
 * absolute URL string when safe, or `null` when it must not be loaded.
 */
export function safeScormUrl(raw: string, base?: string): string | null {
  if (!raw) return null;
  try {
    const origin = base ?? (typeof location !== 'undefined' ? location.origin : undefined);
    const url = new URL(raw, origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    return null;
  } catch {
    return null;
  }
}

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
 * Selector: `assurance-scorm-player`
 */
@Component({
  selector: 'assurance-scorm-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="assurance-scorm-player__wrapper">
      @if (error()) {
        <div class="assurance-scorm-player__error" role="alert">
          <p>This SCORM content could not be loaded because its launch URL is not allowed.</p>
        </div>
      }
      <iframe
        #scormFrame
        class="assurance-scorm-player__frame"
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
      .assurance-scorm-player__wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 4px;
        overflow: hidden;
      }
      .assurance-scorm-player__frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
      .assurance-scorm-player__error {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        color: #fff;
        text-align: center;
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

  /** True when the launch URL was rejected as unsafe (renders an error state). */
  readonly error = signal(false);

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
    // the content begins loading. Direct DOM assignment bypasses Angular's
    // template sanitiser, so we MUST validate the URL ourselves first: under the
    // `allow-scripts allow-same-origin` sandbox a `javascript:`/`data:` URL would
    // be a sanitizer-bypass sink. Only http(s) is allowed (FIX-5).
    const safe = safeScormUrl(this.launchUrl());
    if (!safe) {
      this.error.set(true);
      console.error('[ScormPlayerComponent] Refusing to load unsafe SCORM launch URL.');
      return;
    }
    const frame = this.frameRef?.nativeElement;
    if (frame) {
      this.error.set(false);
      frame.src = safe;
    }
  }
}
