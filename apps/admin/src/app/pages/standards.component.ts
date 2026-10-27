import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LearningApi,
  apiErrorMessage,
  type ApiCourse,
  type ApiModuleOutline,
} from '@assurance/lms-core';
import {
  StandardsApi,
  type StandardsConfiguration,
  type StandardsDelivery,
  type StandardsPackage,
} from '@assurance/standards';

@Component({
  selector: 'assurance-admin-standards',
  standalone: true,
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sf-card">
      <a routerLink="/">Back to admin</a>
      <h1>SCORM packages and xAPI delivery</h1>
      <p>Import SCORM 1.2 or single-SCO SCORM 2004. Packages are immutable versions.</p>
      <p>
        Upload only content you trust and have permission to use. It runs on an isolated origin.
      </p>
      @if (configuration(); as config) {
        <p role="status">
          SCORM: {{ config.enabled ? 'enabled' : 'disabled' }}; storage:
          {{ config.storageConfigured ? 'configured' : 'not configured' }}; content origin:
          {{ config.contentOriginConfigured ? 'configured' : 'not configured' }}. xAPI recording:
          {{ config.xapiRecordingEnabled ? 'enabled' : 'disabled' }}; LRS:
          {{ config.lrsConfigured ? 'configured (delivery status below)' : 'not configured' }}.
          Configuration checks do not prove connectivity.
        </p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p role="status">{{ notice() }}</p>
      }
      <form (ngSubmit)="upload()">
        <label
          >Package title <input name="title" [(ngModel)]="title" maxlength="300" required
        /></label>
        <label
          >SCORM ZIP (up to 50 MB)
          <input #zipFile type="file" accept=".zip,application/zip" (change)="choose($event)" />
        </label>
        <button type="submit" [disabled]="busy() || !file || !title.trim()">Upload package</button>
      </form>
      <button type="button" [disabled]="busy()" (click)="refresh()">Refresh status</button>
      <p>Processing runs in a separate worker. Refresh to see ready or failed imports.</p>
      <h2>Attach a ready package as a new lesson</h2>
      <label
        >Course
        <select name="course" [ngModel]="courseId" (ngModelChange)="selectCourse($event)">
          <option value="">Select course</option>
          @for (course of courses(); track course.id) {
            <option [value]="course.id">{{ course.title }} ({{ course.status }})</option>
          }
        </select>
      </label>
      <label
        >Module
        <select name="module" [(ngModel)]="moduleId">
          <option value="">Select module</option>
          @for (module of modules(); track module.id) {
            <option [value]="module.id">{{ module.title }}</option>
          }
        </select>
      </label>
      <label
        >Lesson title <input name="lessonTitle" [(ngModel)]="lessonTitle" maxlength="300"
      /></label>
      <ul>
        @for (package of packages(); track package.id) {
          <li>
            <strong>{{ package.title }}</strong> - {{ package.status }}
            @if (package.scorm_version) {
              (SCORM {{ package.scorm_version }})
            }
            <small> Version: {{ package.sha256.slice(0, 12) }}</small>
            @if (package.error) {
              <p role="alert">{{ package.error }}</p>
            }
            @if (package.status === 'ready') {
              <button
                type="button"
                [disabled]="busy() || !moduleId || !lessonTitle.trim()"
                (click)="attach(package)"
              >
                Add lesson
              </button>
            }
            @if (package.status !== 'archived' && package.status !== 'processing') {
              <button type="button" [disabled]="busy()" (click)="archive(package)">Archive</button>
            }
          </li>
        }
      </ul>
      <h2>xAPI outbox</h2>
      <p>
        Records completion events when enabled. Delivery requires a configured external LRS and
        worker. No LRS credentials are sent to browsers. This is not a full LRS or cmi5
        implementation.
      </p>
      <ul>
        @for (delivery of deliveries(); track delivery.id) {
          <li>
            {{ delivery.id }} - {{ delivery.delivered_at ? 'Delivered' : 'Pending' }}; attempts:
            {{ delivery.attempts }}
            @if (delivery.last_error) {
              <strong>{{ delivery.last_error }}</strong>
            }
          </li>
        } @empty {
          <li>No recorded events.</li>
        }
      </ul>
    </section>
  `,
  styles: [
    `
      section {
        max-width: 64rem;
        margin: 2rem auto;
        padding: 1.5rem;
      }
      label {
        display: block;
        margin: 0.75rem 0;
      }
      input,
      select {
        margin-left: 0.5rem;
        max-width: 100%;
      }
      button {
        margin: 0.5rem;
        min-height: 44px;
      }
      li {
        margin: 1rem 0;
        overflow-wrap: anywhere;
      }
      small {
        display: block;
      }
    `,
  ],
})
export class StandardsComponent implements OnInit {
  private readonly api = inject(StandardsApi);
  private readonly learning = inject(LearningApi);
  private readonly zipFile = viewChild<ElementRef<HTMLInputElement>>('zipFile');
  readonly packages = signal<StandardsPackage[]>([]);
  readonly deliveries = signal<StandardsDelivery[]>([]);
  readonly configuration = signal<StandardsConfiguration | null>(null);
  readonly courses = signal<ApiCourse[]>([]);
  readonly modules = signal<ApiModuleOutline[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  title = '';
  lessonTitle = '';
  file: File | null = null;
  courseId = '';
  moduleId = '';
  private courseRequest = 0;

  ngOnInit(): void {
    void this.refresh();
  }

  choose(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    this.file = target.files?.[0] ?? null;
    this.error.set('');
    if (
      this.file &&
      (this.file.size > 50_000_000 || !this.file.name.toLowerCase().endsWith('.zip'))
    ) {
      this.file = null;
      const input = this.zipFile()?.nativeElement;
      if (input) input.value = '';
      this.error.set('Select a ZIP no larger than 50 MB.');
    }
  }

  async refresh(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const [packages, deliveries, courses, configuration] = await Promise.all([
        this.api.packages(),
        this.api.deliveries(),
        this.learning.courses(),
        this.api.configuration(),
      ]);
      this.packages.set(packages);
      this.deliveries.set(deliveries);
      this.courses.set(courses);
      this.configuration.set(configuration);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not load packages or LRS delivery status.'));
    } finally {
      this.busy.set(false);
    }
  }

  async upload(): Promise<void> {
    if (!this.file || !this.title.trim() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const packageVersion = await this.api.upload(this.title.trim(), this.file);
      this.packages.update((packages) => [packageVersion, ...packages]);
      this.notice.set('Upload received. The processing worker must validate it before use.');
      this.title = '';
      this.file = null;
      const input = this.zipFile()?.nativeElement;
      if (input) input.value = '';
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Package upload failed.'));
    } finally {
      this.busy.set(false);
    }
  }

  async selectCourse(courseId: string): Promise<void> {
    const request = ++this.courseRequest;
    this.courseId = courseId;
    this.moduleId = '';
    this.modules.set([]);
    if (!courseId) return;
    try {
      const course = await this.learning.course(courseId);
      if (request === this.courseRequest) this.modules.set(course.modules);
    } catch (error) {
      if (request === this.courseRequest)
        this.error.set(apiErrorMessage(error, 'Could not load modules.'));
    }
  }

  async attach(packageVersion: StandardsPackage): Promise<void> {
    if (this.busy() || !this.moduleId || !this.lessonTitle.trim()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await this.api.attach(packageVersion.id, this.moduleId, this.lessonTitle.trim());
      this.notice.set('SCORM lesson added. Publish the course and enroll before testing playback.');
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not attach the package.'));
    } finally {
      this.busy.set(false);
    }
  }

  async archive(packageVersion: StandardsPackage): Promise<void> {
    if (!window.confirm('Archive this version? Attached lessons will no longer launch.')) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.archive(packageVersion.id);
      this.packages.update((packages) =>
        packages.map((p) => (p.id === packageVersion.id ? { ...p, status: 'archived' } : p)),
      );
      this.notice.set('Package archived; active launches have been revoked.');
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not archive package.'));
    } finally {
      this.busy.set(false);
    }
  }
}
