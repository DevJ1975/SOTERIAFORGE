import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Module } from '@forge/shared';
import { PlayerProgressService, type PlayerContext } from './player-progress.service';
import { VideoPlayerComponent } from './video-player.component';

@Component({
  selector: 'forge-module-player',
  standalone: true,
  imports: [VideoPlayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (module().contentType) {
      @case ('video') {
        @defer {
          @if (videoUrl(); as vurl) {
            <forge-video-player
              [url]="vurl"
              [title]="module().title"
              (progress)="onProgress($event)"
              (completed)="onCompleted()"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No video URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading video player…</div>
        }
      }
      @case ('scorm') {
        <div class="forge-module-player__placeholder">
          <p>scorm player — Phase 3</p>
        </div>
      }
      @case ('cmi5') {
        <div class="forge-module-player__placeholder">
          <p>cmi5 player — Phase 3</p>
        </div>
      }
      @case ('unity') {
        <div class="forge-module-player__placeholder">
          <p>unity player — Phase 4</p>
        </div>
      }
      @case ('quiz') {
        <div class="forge-module-player__placeholder">
          <p>quiz player — Phase 4</p>
        </div>
      }
      @case ('game') {
        <div class="forge-module-player__placeholder">
          <p>game player — Phase 5</p>
        </div>
      }
      @default {
        <div class="forge-module-player__placeholder">
          <p>Unknown content type: {{ module().contentType }}</p>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .forge-module-player__placeholder,
      .forge-module-player__loading,
      .forge-module-player__no-url {
        padding: 2rem;
        border: 2px dashed var(--forge-border, #ccc);
        border-radius: 0.5rem;
        text-align: center;
        color: var(--forge-text-muted, #666);
      }
    `,
  ],
})
export class ModulePlayerComponent {
  readonly module = input.required<Module>();
  readonly courseId = input.required<string>();
  readonly tenantId = input.required<string>();
  readonly uid = input.required<string>();

  private readonly playerProgress = inject(PlayerProgressService);

  readonly videoUrl = computed(() => this.module().externalUrl ?? this.module().assetRef);

  private get ctx(): PlayerContext {
    return {
      tenantId: this.tenantId(),
      courseId: this.courseId(),
      module: this.module(),
      uid: this.uid(),
    };
  }

  onProgress(pct: number): void {
    void this.playerProgress.recordProgress(this.ctx, pct);
  }

  onCompleted(): void {
    void this.playerProgress.recordCompletion(this.ctx);
  }
}
