/**
 * RiveCharacterComponent
 *
 * Renders a Rive animation on a <canvas> element and exposes methods to
 * fire state-machine inputs (correct / incorrect / encouragement).
 *
 * @rive-app/canvas is loaded lazily (dynamic import) so it never executes
 * during SSR or in jsdom-based test environments.
 *
 * Intended to be @defer-loaded by host apps.
 */

import {
  AfterNextRenderRef,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  afterNextRender,
  inject,
  input,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'forge-rive-character',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #riveCanvas class="rive-canvas" [attr.aria-label]="'Rive character animation'"></canvas>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }
      .rive-canvas {
        width: 100%;
        height: 100%;
        display: block;
      }
    `,
  ],
})
export class RiveCharacterComponent implements OnDestroy {
  // ---- Inputs ------------------------------------------------------------------

  /** URL to the .riv file. */
  readonly src = input.required<string>();

  /** Name of the state machine to run. */
  readonly stateMachine = input.required<string>();

  // ---- Private state -----------------------------------------------------------

  @ViewChild('riveCanvas', { static: true })
  private readonly riveCanvas!: ElementRef<HTMLCanvasElement>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private riveInstance: any = null;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
  private afterRenderRef: AfterNextRenderRef | null = null;

  // ---- Lifecycle ---------------------------------------------------------------

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.afterRenderRef = afterNextRender(
        () => {
          void this.initRive();
        },
        { injector: this.injector },
      );
    }
  }

  ngOnDestroy(): void {
    this.afterRenderRef?.destroy();
    this.cleanup();
  }

  // ---- Public API --------------------------------------------------------------

  /**
   * Fire a boolean trigger input on the active state machine.
   * Common trigger names: 'correct', 'incorrect', 'encouragement'.
   */
  setTrigger(name: string): void {
    if (!this.riveInstance) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const inputs: any[] = this.riveInstance.stateMachineInputs(this.stateMachine()) ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const input = inputs.find((i: any) => i.name === name);
      if (input && typeof input.fire === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        input.fire();
      } else if (input && 'value' in input) {
        // Boolean input — set to true to trigger
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        input.value = true;
      }
    } catch {
      // Defensive: ignore if state machine is not yet loaded
    }
  }

  // ---- Private helpers ---------------------------------------------------------

  private async initRive(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RiveMod: any = await import('@rive-app/canvas');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RiveClass: any = RiveMod.Rive ?? RiveMod.default?.Rive ?? RiveMod.default;

    const canvas = this.riveCanvas.nativeElement;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    this.riveInstance = new RiveClass({
      src: this.src(),
      canvas,
      stateMachines: this.stateMachine(),
      autoplay: true,
      // Fit the animation to the canvas
      fit: RiveMod.Fit?.Cover ?? 'cover',
      alignment: RiveMod.Alignment?.Center ?? 'center',
    });
  }

  private cleanup(): void {
    if (this.riveInstance) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        this.riveInstance.cleanup();
      } catch {
        // Defensive: Rive may not expose cleanup in all versions
      }
      this.riveInstance = null;
    }
  }
}
