import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  viewChild,
  ElementRef,
} from '@angular/core';
import { Track } from 'livekit-client';

@Component({
  selector: 'assurance-classroom-track',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<div #container></div>',
  styles: [
    `
      :host,
      div {
        display: block;
        height: 100%;
      }
      :host ::ng-deep video {
        width: 100%;
        height: 100%;
        max-height: 65vh;
        object-fit: contain;
      }
    `,
  ],
})
export class ClassroomTrackComponent {
  readonly track = input<Track>();
  readonly muted = input(false);
  private readonly container = viewChild<ElementRef<HTMLDivElement>>('container');

  constructor() {
    effect((onCleanup) => {
      const track = this.track();
      const container = this.container()?.nativeElement;
      if (!track || !container) return;
      const element = track.attach();
      element.muted = this.muted();
      if (element instanceof HTMLVideoElement) element.playsInline = true;
      container.appendChild(element);
      onCleanup(() => {
        track.detach(element);
        element.remove();
      });
    });
  }
}
