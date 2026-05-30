import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { buildLaunchUrl } from './cmi5';

/**
 * Cmi5LauncherComponent
 *
 * Launches a cmi5 Assignable Unit (AU) inside a sandboxed responsive iframe.
 *
 * The component builds the cmi5 launch URL from the provided parameters using
 * `buildLaunchUrl` and renders the AU in an iframe. Per the cmi5 specification,
 * the AU is responsible for sending xAPI statements directly to the LRS using
 * the `endpoint` and `fetch` token it receives via query parameters — this
 * component does *not* intercept those statements.
 *
 * The `completed` output is a lightweight side-channel for the host to know
 * when the AU reports completion (if the AU emits a `window.postMessage` with
 * `{type: 'cmi5:completed'}`). Authoritative completion tracking runs through
 * the LRS pipeline.
 *
 * Selector: `assurance-cmi5-launcher`
 */
@Component({
  selector: 'assurance-cmi5-launcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isBrowser) {
      <div class="assurance-cmi5-launcher__wrapper">
        <iframe
          class="assurance-cmi5-launcher__frame"
          [src]="safeLaunchUrl()"
          title="cmi5 content"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          allowfullscreen
          loading="lazy"
        ></iframe>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .assurance-cmi5-launcher__wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 4px;
        overflow: hidden;
      }
      .assurance-cmi5-launcher__frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
    `,
  ],
})
export class Cmi5LauncherComponent {
  // ---------------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------------

  /** Base URL of the Assignable Unit (AU). Must be an absolute URL. */
  readonly auUrl = input.required<string>();

  /** xAPI LRS endpoint URL. */
  readonly endpoint = input<string>('');

  /** Token fetch URL the AU calls to obtain a one-time LRS auth token. */
  readonly fetch = input<string>('');

  /** JSON-serialised xAPI Actor object for the learner. */
  readonly actor = input<string>('');

  /** Registration UUID linking this launch to an enrolment. */
  readonly registration = input<string>('');

  /** Activity IRI identifying the AU (the learning object). */
  readonly activityId = input<string>('');

  // ---------------------------------------------------------------------------
  // Outputs
  // ---------------------------------------------------------------------------

  /**
   * Emitted when the AU signals completion via `window.postMessage`.
   * NOTE: authoritative completion is tracked via xAPI/LRS — this output is a
   * convenience hook for host-page UX updates only.
   */
  readonly completed = output<{ completed: boolean }>();

  // ---------------------------------------------------------------------------
  // Private state
  // ---------------------------------------------------------------------------

  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);

  readonly isBrowser: boolean = isPlatformBrowser(this.platformId);

  // ---------------------------------------------------------------------------
  // Computed safe launch URL
  // ---------------------------------------------------------------------------

  /**
   * Builds the full cmi5 launch URL and wraps it in a `SafeResourceUrl`.
   * Evaluated reactively whenever any input signal changes.
   */
  readonly safeLaunchUrl: () => SafeResourceUrl = computed(() => {
    const raw = buildLaunchUrl(this.auUrl(), {
      endpoint: this.endpoint(),
      fetch: this.fetch(),
      actor: this.actor(),
      registration: this.registration(),
      activityId: this.activityId(),
    });
    return this.sanitizer.bypassSecurityTrustResourceUrl(raw);
  });
}
