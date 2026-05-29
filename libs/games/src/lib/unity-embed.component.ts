/**
 * UnityEmbedComponent
 *
 * Embeds a Unity WebGL build (or any cmi5/xAPI-compliant launch URL) inside
 * a sandboxed responsive <iframe>.
 *
 * IMPORTANT — Reporting path:
 *   The authoritative xAPI / cmi5 reporting path runs directly from the Unity
 *   runtime to the LRS (Learning Record Store) via the launch URL parameters
 *   supplied by the cmi5 player.  The postMessage listener exposed here is a
 *   **lightweight, optional** side-channel for non-cmi5 shell messages only
 *   (e.g. "show overlay", "scroll host page").  Never rely on it for grade or
 *   completion data.  See docs/unity-cmi5-contract.md for the full contract.
 *
 * Intended to be @defer-loaded by host apps.
 */

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  inject,
  input,
  output,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/** Shape of postMessage payloads emitted by the Unity build to the host page. */
export interface UnityShellMessage {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
}

@Component({
  selector: 'forge-unity-embed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="unity-wrapper" [attr.aria-label]="title() || 'Unity game'">
      <iframe
        #unityFrame
        class="unity-frame"
        [src]="launchUrl()"
        [title]="title() || 'Unity game'"
        allow="fullscreen"
        allowfullscreen
        sandbox="allow-scripts allow-same-origin"
        loading="lazy"
      ></iframe>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .unity-wrapper {
        position: relative;
        width: 100%;
        /* 16:9 aspect ratio by default */
        aspect-ratio: 16 / 9;
        background: #000;
        border-radius: 8px;
        overflow: hidden;
      }
      .unity-frame {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        border: none;
      }
    `,
  ],
})
export class UnityEmbedComponent implements OnInit, OnDestroy {
  // ---- Inputs ------------------------------------------------------------------

  /**
   * cmi5 launch URL as provided by the LMS / cmi5 player.
   * The URL must already include the required cmi5 launch parameters
   * (endpoint, fetch, activityId, registration, actor).
   * See docs/unity-cmi5-contract.md.
   */
  readonly launchUrl = input.required<string>();

  /** Accessible title for the iframe. */
  readonly title = input<string>('');

  // ---- Outputs -----------------------------------------------------------------

  /**
   * Emits lightweight, non-cmi5 shell messages received via postMessage.
   * NOT used for xAPI / grade / completion reporting — see class comment.
   */
  readonly signal = output<UnityShellMessage>();

  // ---- Private state -----------------------------------------------------------

  private readonly platformId = inject(PLATFORM_ID);
  private readonly elementRef = inject(ElementRef);
  private messageListener: ((ev: MessageEvent) => void) | null = null;

  // ---- Lifecycle ---------------------------------------------------------------

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.messageListener = (ev: MessageEvent) => {
      // Only accept messages from the same iframe origin for safety.
      // A host app may further restrict origins by checking ev.origin.
      if (ev.source == null) return;

      // Verify the source is our embedded iframe
      const iframe = this.elementRef.nativeElement.querySelector('iframe') as HTMLIFrameElement | null;
      if (iframe && ev.source !== iframe.contentWindow) return;

      // Accept only plain objects with a string `type` field
      if (
        ev.data !== null &&
        typeof ev.data === 'object' &&
        typeof (ev.data as Record<string, unknown>)['type'] === 'string'
      ) {
        this.signal.emit(ev.data as UnityShellMessage);
      }
    };

    window.addEventListener('message', this.messageListener);
  }

  ngOnDestroy(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }
}
