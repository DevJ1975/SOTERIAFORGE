import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ForgeSession } from '@assurance/auth';
import { ClassroomTrackComponent } from './classroom-track.component';
import { EngageService } from './engage.service';

@Component({
  selector: 'assurance-engage',
  standalone: true,
  imports: [FormsModule, ClassroomTrackComponent],
  providers: [EngageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="engage" aria-labelledby="engage-heading">
      <header>
        <h1 id="engage-heading">Forge Engage</h1>
        <p>Live video classrooms for your organization.</p>
      </header>
      @if (classroom.error()) {
        <p role="alert" class="error">{{ classroom.error() }}</p>
      }
      @if (classroom.activeClassroom(); as active) {
        <h2>{{ active.title }}</h2>
        <p role="status">Connection: {{ classroom.state() }}</p>
        <div class="controls" aria-label="Classroom controls">
          <button
            type="button"
            (click)="classroom.toggle('microphone')"
            [disabled]="classroom.busy() || classroom.state() !== 'connected'"
            [attr.aria-pressed]="classroom.microphoneEnabled()"
          >
            {{ classroom.microphoneEnabled() ? 'Mute microphone' : 'Enable microphone' }}
          </button>
          <button
            type="button"
            (click)="classroom.toggle('camera')"
            [disabled]="classroom.busy() || classroom.state() !== 'connected'"
            [attr.aria-pressed]="classroom.cameraEnabled()"
          >
            {{ classroom.cameraEnabled() ? 'Turn camera off' : 'Enable camera' }}
          </button>
          @if (classroom.canScreenShare() && classroom.supportsScreenShare) {
            <button
              type="button"
              (click)="classroom.toggle('screen')"
              [disabled]="classroom.busy() || classroom.state() !== 'connected'"
              [attr.aria-pressed]="classroom.screenShareEnabled()"
            >
              {{ classroom.screenShareEnabled() ? 'Stop sharing' : 'Share screen' }}
            </button>
          }
          @if (classroom.needsAudioStart()) {
            <button type="button" (click)="classroom.startAudio()">Enable classroom audio</button>
          }
          <button type="button" (click)="classroom.leave()">Leave classroom</button>
        </div>
        <p>Your camera and microphone are off when you join. Enable them when you are ready.</p>
        @if (classroom.canScreenShare() && !classroom.supportsScreenShare) {
          <p>Screen sharing is unavailable in this browser. Use desktop Chrome over HTTPS.</p>
        }
        <div class="grid" aria-label="Classroom participants">
          @for (tile of classroom.tiles(); track tile.id) {
            <article class="tile" [attr.aria-label]="tile.name">
              <div class="video">
                @if (tile.video) {
                  <assurance-classroom-track [track]="tile.video" [muted]="true" />
                } @else {
                  <span>Camera off</span>
                }
              </div>
              @if (tile.audio) {
                <assurance-classroom-track [track]="tile.audio" />
              }
              <p>{{ tile.name }}</p>
            </article>
          }
        </div>
      } @else {
        @if (session.canAuthor()) {
          <form (ngSubmit)="create()" class="create">
            <label for="classroom-title">New classroom title</label>
            <input
              id="classroom-title"
              name="title"
              [(ngModel)]="title"
              required
              maxlength="120"
              [disabled]="classroom.busy()"
            />
            <button type="submit" [disabled]="classroom.busy() || !title.trim()">
              Create classroom
            </button>
          </form>
        }
        <p>
          Classrooms are open to active members of this organization. Up to 21 participants per
          room.
        </p>
        <p>Optimized for desktop Chrome. Allow camera and microphone access when prompted.</p>
        <button
          type="button"
          (click)="classroom.load()"
          [disabled]="classroom.loading() || classroom.busy()"
        >
          Refresh classrooms
        </button>
        @if (classroom.loading()) {
          <p role="status">Loading classrooms...</p>
        } @else {
          <ul class="rooms">
            @for (room of classroom.classrooms(); track room.id) {
              <li>
                <h2>{{ room.title }}</h2>
                <button type="button" (click)="classroom.join(room)" [disabled]="classroom.busy()">
                  Join {{ room.title }}
                </button>
              </li>
            } @empty {
              <li>No classrooms yet. Your instructor can create one here.</li>
            }
          </ul>
        }
        @if (classroom.state() === 'connecting') {
          <p role="status">Connecting to classroom...</p>
          <button type="button" (click)="classroom.leave()">Cancel connection</button>
        }
      }
    </section>
  `,
  styles: [
    `
      .engage {
        color: var(--sf-dark-text, #f1f5f9);
        max-width: 90rem;
        margin: auto;
      }
      header,
      .create,
      .controls,
      .rooms {
        margin-bottom: 1.5rem;
      }
      .controls,
      .create {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      button,
      input {
        font: inherit;
        padding: 0.65rem 0.9rem;
        border-radius: 0.4rem;
      }
      button {
        cursor: pointer;
        border: 1px solid #94a3b8;
        color: #0f172a;
        background: #e2e8f0;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      button[aria-pressed='true'] {
        background: #bbf7d0;
      }
      input {
        min-width: 0;
        border: 1px solid #94a3b8;
      }
      .rooms {
        list-style: none;
        padding: 0;
        display: grid;
        gap: 1rem;
      }
      .rooms li,
      .tile {
        border: 1px solid var(--sf-dark-line, #475569);
        border-radius: 0.75rem;
        padding: 1rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
        gap: 1rem;
      }
      .video {
        aspect-ratio: 16 / 9;
        background: #0f172a;
        display: grid;
        place-items: center;
      }
      .tile p {
        margin-bottom: 0;
      }
      .error {
        border-left: 4px solid #fca5a5;
        padding: 1rem;
        background: #450a0a;
        color: #fecaca;
      }
      :is(button, input):focus-visible {
        outline: 3px solid #93c5fd;
        outline-offset: 3px;
      }
    `,
  ],
})
export class EngageComponent implements OnInit {
  protected readonly classroom = inject(EngageService);
  protected readonly session = inject(ForgeSession);
  protected title = '';

  ngOnInit(): void {
    void this.classroom.load();
  }

  protected async create(): Promise<void> {
    await this.classroom.create(this.title);
    if (!this.classroom.error()) this.title = '';
  }
}
