import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import {
  StandardsApi,
  type StandardsCommit,
  type StandardsCompletion,
  type StandardsLaunch,
} from './standards-api';

@Component({
  selector: 'assurance-managed-scorm-player',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (launching()) {
      <p role="status">Opening SCORM lesson...</p>
    }
    @if (!src() && !launching()) {
      <button type="button" class="sf-btn sf-btn--secondary" (click)="start()">Open lesson</button>
    }
    @if (src(); as source) {
      <iframe
        #frame
        title="SCORM classroom"
        [src]="source"
        sandbox="allow-scripts allow-same-origin allow-forms"
        referrerpolicy="no-referrer"
      ></iframe>
      <p role="status">{{ saving() ? 'Saving progress...' : saved() ? 'Progress saved.' : '' }}</p>
      @if (pending() && error()) {
        <button type="button" class="sf-btn sf-btn--secondary" (click)="retry()">Retry save</button>
      }
      <p>Keep this page open until progress is saved. Leaving does not complete the lesson.</p>
    }
  `,
  styles: [
    `
      iframe {
        display: block;
        width: 100%;
        height: 70vh;
        border: 0;
      }
    `,
  ],
})
export class ManagedScormPlayerComponent {
  readonly lessonId = input.required<string>();
  readonly completed = output<StandardsCompletion>();
  protected readonly src = signal<SafeResourceUrl | null>(null);
  protected readonly launching = signal(false);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal('');
  protected readonly pending = signal<StandardsCommit | null>(null);
  private readonly dirty = signal(false);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly api = inject(StandardsApi);
  private readonly sanitizer = inject(DomSanitizer);
  private launch: StandardsLaunch | null = null;
  private generation = 0;
  private destroyed = false;
  private previousLesson: string | null = null;

  constructor() {
    const onMessage = (event: MessageEvent<unknown>): void => void this.receive(event);
    const onUnload = (event: BeforeUnloadEvent): void => {
      if (this.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('beforeunload', onUnload);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.generation++;
      window.removeEventListener('message', onMessage);
      window.removeEventListener('beforeunload', onUnload);
    });
    effect(() => {
      const lesson = this.lessonId();
      if (lesson !== this.previousLesson) {
        this.previousLesson = lesson;
        this.generation++;
        this.launch = null;
        this.src.set(null);
        this.pending.set(null);
        this.dirty.set(false);
        this.error.set('');
        this.saved.set(false);
        this.saving.set(false);
        this.launching.set(false);
      }
    });
  }

  protected async start(): Promise<void> {
    if (this.launching()) return;
    const generation = ++this.generation;
    this.error.set('');
    this.launching.set(true);
    try {
      const launch = await this.api.launch(this.lessonId());
      const url = new URL(launch.url);
      if (
        url.origin !== launch.origin ||
        url.origin === window.location.origin ||
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        !url.pathname.startsWith('/launch/')
      ) {
        throw new Error('The API returned an invalid isolated content launch.');
      }
      if (this.destroyed || generation !== this.generation) return;
      this.launch = launch;
      this.src.set(this.sanitizer.bypassSecurityTrustResourceUrl(url.href));
    } catch (error) {
      if (generation === this.generation)
        this.error.set(message(error, 'Could not open this lesson.'));
    } finally {
      if (generation === this.generation) this.launching.set(false);
    }
  }

  private post(body: object): void {
    if (this.launch)
      this.frame()?.nativeElement.contentWindow?.postMessage(body, this.launch.origin);
  }

  private async receive(event: MessageEvent<unknown>): Promise<void> {
    const launch = this.launch;
    if (
      !launch ||
      event.origin !== launch.origin ||
      event.source !== this.frame()?.nativeElement.contentWindow ||
      !isRecord(event.data) ||
      event.data['launchId'] !== launch.id
    )
      return;
    const data = event.data;
    if (data['type'] === 'forge.scorm.ready') {
      this.post({ type: 'forge.scorm.connect', launchId: launch.id });
      return;
    }
    if (data['type'] === 'forge.scorm.dirty') {
      this.dirty.set(true);
      this.saved.set(false);
      return;
    }
    if (data['type'] === 'forge.scorm.clean' && !this.pending() && !this.saving()) {
      this.dirty.set(false);
      return;
    }
    if (data['type'] !== 'forge.scorm.commit' || this.saving()) return;
    if (
      !Number.isSafeInteger(data['sequence']) ||
      typeof data['sequence'] !== 'number' ||
      data['sequence'] < 1 ||
      !isRecord(data['cmi'])
    )
      return;
    const body = { sequence: data['sequence'], cmi: data['cmi'] };
    if (JSON.stringify(body).length > 64_500) {
      this.error.set('SCORM runtime exceeds the supported 64 KB save limit.');
      this.post({ type: 'forge.scorm.error', launchId: launch.id });
      return;
    }
    const pending = this.pending();
    if (pending && JSON.stringify(pending) !== JSON.stringify(body)) {
      this.error.set('An earlier SCORM save is pending. Retry it before continuing.');
      return;
    }
    this.pending.set(body);
    await this.retry();
  }

  protected async retry(): Promise<void> {
    const body = this.pending();
    const launch = this.launch;
    if (!body || !launch || this.saving()) return;
    const generation = this.generation;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    try {
      const result = await this.api.commit(launch.id, body);
      if (generation !== this.generation || this.destroyed) return;
      this.pending.set(null);
      this.dirty.set(false);
      this.saved.set(true);
      this.post({ type: 'forge.scorm.ack', launchId: launch.id, sequence: result.sequence });
      if (result.completion) this.completed.emit(result.completion);
    } catch (error) {
      if (generation !== this.generation || this.destroyed) return;
      this.error.set(message(error, 'Progress was not saved. Check your connection and retry.'));
      this.post({ type: 'forge.scorm.error', launchId: launch.id });
    } finally {
      if (generation === this.generation) this.saving.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    return this.dirty() || this.pending() !== null || this.saving();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function message(error: unknown, fallback: string): string {
  if (isRecord(error) && isRecord(error['error']) && typeof error['error']['detail'] === 'string') {
    return error['error']['detail'];
  }
  return error instanceof Error ? error.message : fallback;
}
