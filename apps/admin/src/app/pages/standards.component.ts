import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
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
  type DispatchFormat,
  type StandardsConfiguration,
  type StandardsDelivery,
  type StandardsDispatch,
  type StandardsPackage,
} from '@assurance/standards';

/** One origin per line (or comma separated), normalised; `invalid` lists what was rejected. */
export function parseOrigins(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,]+/)) {
    const value = raw.trim();
    if (!value) continue;
    let origin: string | null = null;
    try {
      const url = new URL(value);
      if (url.protocol === 'https:') origin = url.origin;
    } catch {
      origin = null;
    }
    if (!origin) invalid.push(value);
    else if (!origins.includes(origin)) origins.push(origin);
  }
  return { origins, invalid };
}

const MAX_ORIGINS = 10;

/** `detail`, or the first DRF field error (e.g. `{lmsOrigins: ['…']}`), or the fallback. */
function dispatchErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse && error.status === 400) {
    const body: unknown = error.error;
    if (body && typeof body === 'object' && !('detail' in body)) {
      for (const value of Object.values(body)) {
        const first: unknown = Array.isArray(value) ? value[0] : value;
        if (typeof first === 'string') return first;
      }
    }
  }
  return apiErrorMessage(error, fallback);
}

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
      <h2 id="lms-export">Export for an LMS</h2>
      <p>
        Create a small package that another LMS imports. The course stays here: the package opens it
        in Soteria Forge, learners sign in with their Forge account, and progress, completion and
        score are reported back to the LMS.
      </p>
      <form (ngSubmit)="createExport()" aria-labelledby="lms-export">
        <label
          >Published course
          <select name="exportCourse" [(ngModel)]="exportCourseId" required>
            <option value="">Select course</option>
            @for (course of publishedCourses(); track course.id) {
              <option [value]="course.id">{{ course.title }}</option>
            }
          </select>
        </label>
        <label
          >Format
          <select name="exportFormat" [(ngModel)]="exportFormat">
            <option value="scorm12">SCORM 1.2</option>
            <option value="cmi5">cmi5</option>
          </select>
        </label>
        <label for="export-origins">LMS origins, one per line</label>
        <textarea
          id="export-origins"
          name="exportOrigins"
          rows="3"
          [(ngModel)]="exportOrigins"
          aria-describedby="export-origins-help"
          placeholder="https://lms.example.org"
        ></textarea>
        <p id="export-origins-help">
          The address the LMS serves course content from, starting with https://. Some LMSs use a
          different address for content than for their own pages. Required for SCORM, because
          progress is only sent to these addresses; optional for cmi5. Up to 10.
        </p>
        <button type="submit" [disabled]="busy() || !exportCourseId">Create export</button>
      </form>
      <ul aria-label="LMS exports">
        @for (item of dispatches(); track item.id) {
          <li>
            <strong>{{ item.courseTitle }}</strong> - {{ formatLabel(item.format) }}
            @if (item.revoked) {
              <strong> (revoked)</strong>
            }
            <small>Launch URL: {{ item.launchUrl }}</small>
            @if (editingId() === item.id) {
              <label [attr.for]="'origins-' + item.id">LMS origins, one per line</label>
              <textarea
                [id]="'origins-' + item.id"
                [name]="'origins-' + item.id"
                rows="3"
                [(ngModel)]="editOrigins"
              ></textarea>
              <button type="button" [disabled]="busy()" (click)="saveOrigins(item)">
                Save origins
              </button>
              <button type="button" [disabled]="busy()" (click)="editingId.set('')">Cancel</button>
            } @else {
              <small
                >LMS origins:
                {{ item.lmsOrigins.length ? item.lmsOrigins.join(', ') : 'none' }}</small
              >
            }
            @if (!item.revoked) {
              <button type="button" [disabled]="busy()" (click)="download(item)">
                Download package
              </button>
              <button type="button" (click)="copyLaunchUrl(item)">Copy launch URL</button>
              @if (editingId() !== item.id) {
                <button type="button" [disabled]="busy()" (click)="editExport(item)">
                  Edit origins
                </button>
              }
              <button type="button" [disabled]="busy()" (click)="revoke(item)">Revoke</button>
            }
          </li>
        } @empty {
          <li>No exports yet.</li>
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
      textarea {
        display: block;
        width: 100%;
        max-width: 36rem;
        font: inherit;
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
  readonly dispatches = signal<StandardsDispatch[]>([]);
  readonly publishedCourses = computed(() =>
    this.courses().filter((course) => course.status === 'published'),
  );
  readonly editingId = signal('');
  exportCourseId = '';
  exportFormat: DispatchFormat = 'scorm12';
  exportOrigins = '';
  editOrigins = '';
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
    // Loaded apart from the rest so a failure here leaves the SCORM import tools usable.
    try {
      this.dispatches.set(await this.api.dispatches());
    } catch (error) {
      if (!this.error()) this.error.set(apiErrorMessage(error, 'Could not load LMS exports.'));
    }
  }

  formatLabel(format: DispatchFormat): string {
    return format === 'scorm12' ? 'SCORM 1.2' : 'cmi5';
  }

  /** Origins ready to send, or null after showing why they can't be used. */
  private originsFrom(text: string, format: DispatchFormat): string[] | null {
    const { origins, invalid } = parseOrigins(text);
    if (invalid.length) {
      this.error.set(`Enter each LMS origin as an https:// address. Check: ${invalid.join(', ')}`);
      return null;
    }
    if (origins.length > MAX_ORIGINS) {
      this.error.set(`Enter at most ${MAX_ORIGINS} LMS origins.`);
      return null;
    }
    if (format === 'scorm12' && !origins.length) {
      this.error.set('A SCORM export needs at least one LMS origin.');
      return null;
    }
    return origins;
  }

  async createExport(): Promise<void> {
    if (this.busy() || !this.exportCourseId) return;
    this.error.set('');
    this.notice.set('');
    const lmsOrigins = this.originsFrom(this.exportOrigins, this.exportFormat);
    if (!lmsOrigins) return;
    this.busy.set(true);
    try {
      const created = await this.api.createDispatch({
        courseId: this.exportCourseId,
        format: this.exportFormat,
        lmsOrigins,
      });
      this.dispatches.update((items) => [created, ...items]);
      this.exportOrigins = '';
      this.notice.set('Export created. Download the package and import it into the LMS.');
    } catch (error) {
      this.error.set(dispatchErrorMessage(error, 'Could not create the export.'));
    } finally {
      this.busy.set(false);
    }
  }

  async download(item: StandardsDispatch): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { blob, filename } = await this.api.dispatchPackage(item);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Could not download the package.'));
    } finally {
      this.busy.set(false);
    }
  }

  async copyLaunchUrl(item: StandardsDispatch): Promise<void> {
    this.error.set('');
    try {
      await navigator.clipboard.writeText(item.launchUrl);
      this.notice.set('Launch URL copied.');
    } catch {
      this.error.set('Could not copy. Select the launch URL and copy it by hand.');
    }
  }

  editExport(item: StandardsDispatch): void {
    this.editOrigins = item.lmsOrigins.join('\n');
    this.editingId.set(item.id);
  }

  async saveOrigins(item: StandardsDispatch): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.notice.set('');
    const lmsOrigins = this.originsFrom(this.editOrigins, item.format);
    if (!lmsOrigins) return;
    await this.patch(item, { lmsOrigins }, 'LMS origins saved.', 'Could not save the origins.');
    if (!this.error()) this.editingId.set('');
  }

  async revoke(item: StandardsDispatch): Promise<void> {
    if (this.busy()) return;
    if (!window.confirm('Revoke this export? The package already in the LMS will stop working.'))
      return;
    this.error.set('');
    this.notice.set('');
    await this.patch(item, { revoked: true }, 'Export revoked.', 'Could not revoke the export.');
  }

  private async patch(
    item: StandardsDispatch,
    changes: { lmsOrigins?: string[]; revoked?: boolean },
    done: string,
    failed: string,
  ): Promise<void> {
    this.busy.set(true);
    try {
      const updated = await this.api.updateDispatch(item.id, changes);
      this.dispatches.update((items) => items.map((d) => (d.id === updated.id ? updated : d)));
      this.notice.set(done);
    } catch (error) {
      this.error.set(dispatchErrorMessage(error, failed));
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
