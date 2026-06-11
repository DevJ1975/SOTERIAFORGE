import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import {
  createScorm12Api,
  createScorm2004Api,
  installScormApi,
  removeScormApi,
  type Scorm12Api,
  type Scorm2004Api,
  type ScormStatusChange,
  type ScormVersion,
} from '@forge/standards';

/**
 * Plays a SCORM package — the zip-with-an-HTML-launcher format Articulate,
 * Captivate, iSpring and friends export and every legacy LMS expects.
 *
 * The player creates an in-memory SCORM runtime (`@forge/standards`),
 * installs it on `window` as `API` (1.2) or `API_1484_11` (2004) *before* the
 * content iframe renders, and the SCO finds it via the standard IMS parent-
 * frame discovery walk. Every `Commit`/`Finish` surfaces through `cmiChanged`
 * so the host can persist the attempt; completion/score movements surface
 * through `statusChanged` and drive the slim status footer.
 *
 * The API is removed from `window` on destroy and re-created/re-installed
 * whenever `src` or `version` changes (a fresh runtime, re-seeded from
 * `initialCmi`).
 */
@Component({
  selector: 'forge-scorm-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!src()) {
      <div class="scorm-error" role="alert">No SCORM launch URL provided.</div>
    } @else {
      <div class="frame">
        @if (loading()) {
          <div class="shimmer" aria-hidden="true"></div>
        }
        @if (frameSrc(); as launchUrl) {
          <iframe
            [src]="launchUrl"
            sandbox="allow-scripts allow-same-origin allow-forms"
            title="SCORM content"
            (load)="loading.set(false)"
          ></iframe>
        }
      </div>
      <footer class="status-bar">SCORM {{ version() }} · {{ statusLabel() }}</footer>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .frame {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius);
      background: var(--forge-surface);
    }
    iframe {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .shimmer {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        100deg,
        var(--forge-surface) 40%,
        var(--forge-surface-dim) 50%,
        var(--forge-surface) 60%
      );
      background-size: 200% 100%;
      animation: scorm-shimmer 1.4s ease-in-out infinite;
      pointer-events: none;
    }
    @keyframes scorm-shimmer {
      from {
        background-position: 200% 0;
      }
      to {
        background-position: -200% 0;
      }
    }
    .scorm-error {
      padding: 1rem;
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius);
      color: var(--forge-negative);
      background: var(--forge-surface);
      font-family: var(--forge-font);
    }
    .status-bar {
      margin-top: 0.5rem;
      padding: 0.375rem 0.75rem;
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius-small);
      background: var(--forge-surface);
      color: var(--forge-text-subtle);
      font-family: var(--forge-font);
      font-size: 0.8125rem;
      line-height: 1.4;
    }
  `,
})
export class ForgeScormPlayer {
  /** Launch URL of the SCO (the manifest's resource href). */
  readonly src = input.required<string>();
  /** SCORM dialect of the package. */
  readonly version = input<ScormVersion>('1.2');
  /** Seed CMI state (e.g. last committed attempt) — flat or nested. */
  readonly initialCmi = input<Record<string, unknown>>({});
  /** Passed through to cmi.core.student_name / cmi.learner_name. */
  readonly learnerName = input<string | undefined>(undefined);
  /** Passed through to cmi.core.student_id / cmi.learner_id. */
  readonly learnerId = input<string | undefined>(undefined);

  /** Fires with the full flat CMI map on every Commit/Finish/Terminate. */
  readonly cmiChanged = output<Record<string, unknown>>();
  /** Fires when the content reports completion/success/score movement. */
  readonly statusChanged = output<ScormStatusChange>();

  private readonly domSanitizer = inject(DomSanitizer);

  protected readonly loading = signal(true);
  protected readonly frameSrc = signal<SafeResourceUrl | null>(null);
  private readonly status = signal<ScormStatusChange | null>(null);

  protected readonly statusLabel = computed(() => {
    const status = this.status();
    if (!status) return 'In progress';
    const score = status.scoreRaw !== undefined ? ` (${Math.round(status.scoreRaw)}%)` : '';
    if (status.passed === true) return `Passed ✓${score}`;
    if (status.passed === false) return `Failed ✗${score}`;
    if (status.completed) return `Completed ✓${score}`;
    return `In progress${score}`;
  });

  constructor() {
    // Install the runtime API before the iframe ever renders (the iframe is
    // gated on frameSrc, set only after installation), and re-install with a
    // fresh runtime whenever src or version changes. onCleanup also covers
    // component destroy.
    effect((onCleanup) => {
      const src = this.src();
      const version = this.version();
      if (!src) {
        this.frameSrc.set(null);
        return;
      }
      const api = untracked(() => this.createApi(version));
      installScormApi(window, api, version);
      onCleanup(() => removeScormApi(window, version));
      this.loading.set(true);
      this.status.set(null);
      this.frameSrc.set(this.domSanitizer.bypassSecurityTrustResourceUrl(src));
    });
  }

  private createApi(version: ScormVersion): Scorm12Api | Scorm2004Api {
    const opts = {
      initialCmi: this.initialCmi(),
      learnerName: this.learnerName(),
      learnerId: this.learnerId(),
      onCommit: (cmi: Record<string, string>) => this.cmiChanged.emit(cmi),
      onStatusChange: (change: ScormStatusChange) => {
        this.status.set(change);
        this.statusChanged.emit(change);
      },
    };
    return version === '2004' ? createScorm2004Api(opts) : createScorm12Api(opts);
  }
}
