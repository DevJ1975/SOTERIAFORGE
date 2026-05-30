import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { Module } from '@assurance/shared';
import { EnrollmentService } from '@assurance/lms-core';
import {
  Cmi5LaunchService,
  Cmi5LaunchResult,
  ScormPlayerComponent,
  Cmi5LauncherComponent,
} from '@assurance/standards';
import { PlayerProgressService, type PlayerContext } from './player-progress.service';
import { VideoPlayerComponent } from './video-player.component';
import { QuizPlayerComponent } from './quiz-player.component';
import { GamePlayerComponent } from './game-player.component';

@Component({
  selector: 'forge-module-player',
  standalone: true,
  imports: [
    VideoPlayerComponent,
    ScormPlayerComponent,
    Cmi5LauncherComponent,
    QuizPlayerComponent,
    GamePlayerComponent,
  ],
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
        @defer {
          @if (contentUrl(); as url) {
            <forge-scorm-player
              [launchUrl]="url"
              [scormVersion]="'2004'"
              (commit)="onScormCommit($event)"
              (completed)="onScormCompleted($event)"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No SCORM URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading SCORM player…</div>
        }
      }
      @case ('cmi5') {
        @defer {
          @if (cmi5Params(); as params) {
            <forge-cmi5-launcher
              [auUrl]="params.auUrl"
              [endpoint]="params.endpoint"
              [fetch]="params.fetch"
              [actor]="actorJson()"
              [registration]="params.registration"
              [activityId]="params.activityId"
              (completed)="onCmi5Completed($event)"
            />
          } @else if (cmi5Loading()) {
            <div class="forge-module-player__loading">Loading cmi5 player…</div>
          } @else {
            <div class="forge-module-player__no-url">
              <p>No cmi5 URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading cmi5 player…</div>
        }
      }
      @case ('unity') {
        @defer {
          @if (cmi5Params(); as params) {
            <forge-cmi5-launcher
              [auUrl]="params.auUrl"
              [endpoint]="params.endpoint"
              [fetch]="params.fetch"
              [actor]="actorJson()"
              [registration]="params.registration"
              [activityId]="params.activityId"
              (completed)="onCmi5Completed($event)"
            />
          } @else if (cmi5Loading()) {
            <div class="forge-module-player__loading">Loading Unity player…</div>
          } @else {
            <div class="forge-module-player__no-url">
              <p>No Unity URL configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading Unity player…</div>
        }
      }
      @case ('quiz') {
        @defer {
          @if (module().assetRef; as quizId) {
            <forge-quiz-player
              [quizId]="quizId"
              [courseId]="courseId()"
              [moduleId]="module().id"
              [tenantId]="tenantId()"
              [uid]="uid()"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No quiz configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading quiz player…</div>
        }
      }
      @case ('game') {
        @defer {
          @if (module().assetRef; as gameId) {
            <forge-game-player
              [gameId]="gameId"
              [courseId]="courseId()"
              [moduleId]="module().id"
              [tenantId]="tenantId()"
              [uid]="uid()"
            />
          } @else {
            <div class="forge-module-player__no-url">
              <p>No game configured for this module.</p>
            </div>
          }
        } @placeholder {
          <div class="forge-module-player__loading">Loading game player…</div>
        }
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
  private readonly enrollmentService = inject(EnrollmentService);
  private readonly cmi5LaunchService = inject(Cmi5LaunchService);
  private readonly platformId = inject(PLATFORM_ID);

  /** URL for video modules. */
  readonly videoUrl = computed(() => this.module().externalUrl ?? this.module().assetRef);

  /** URL for SCORM modules. */
  readonly contentUrl = computed(() => this.module().externalUrl ?? this.module().assetRef);

  /** Server-issued cmi5 launch parameters (null until resolved). */
  readonly cmi5Params = signal<Cmi5LaunchResult | null>(null);

  /** True while the server launch call is in-flight. */
  readonly cmi5Loading = signal(false);

  /**
   * JSON-serialised xAPI Actor from the server-issued params.
   * Used by `forge-cmi5-launcher`'s `actor` input (which expects a string).
   */
  readonly actorJson = computed(() => JSON.stringify(this.cmi5Params()?.actor ?? null));

  constructor() {
    // Trigger a cmi5 launch-params fetch on first render, but only in the
    // browser (guards against SSR / prerender calling a Firebase function).
    afterNextRender(() => {
      const type = this.module().contentType;
      if (type === 'cmi5' || type === 'unity') {
        void this._fetchCmi5Params();
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _fetchCmi5Params(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const mod = this.module();
    const auUrl = mod.externalUrl ?? mod.assetRef ?? '';
    const activityId = `https://soteriaforge.com/xapi/activity/${mod.id}`;

    this.cmi5Loading.set(true);
    try {
      const params = await this.cmi5LaunchService.launch(activityId, auUrl);
      this.cmi5Params.set(params);
    } finally {
      this.cmi5Loading.set(false);
    }
  }

  private get ctx(): PlayerContext {
    return {
      tenantId: this.tenantId(),
      courseId: this.courseId(),
      module: this.module(),
      uid: this.uid(),
    };
  }

  // ---------------------------------------------------------------------------
  // Video event handlers
  // ---------------------------------------------------------------------------

  onProgress(pct: number): void {
    void this.playerProgress.recordProgress(this.ctx, pct);
  }

  onCompleted(): void {
    void this.playerProgress.recordCompletion(this.ctx);
  }

  // ---------------------------------------------------------------------------
  // SCORM event handlers
  // ---------------------------------------------------------------------------

  onScormCommit(cmi: Record<string, unknown>): void {
    void this.enrollmentService.saveCmi(
      this.tenantId(),
      this.courseId(),
      this.uid(),
      this.module().id,
      cmi,
    );
  }

  onScormCompleted(event: { completed: boolean; score?: number }): void {
    if (event.completed) {
      void this.playerProgress.recordCompletion(this.ctx, event.score);
    }
  }

  // ---------------------------------------------------------------------------
  // cmi5 / Unity event handlers
  // ---------------------------------------------------------------------------

  onCmi5Completed(event: { completed: boolean }): void {
    if (event.completed) {
      void this.playerProgress.recordCompletion(this.ctx);
    }
  }
}
