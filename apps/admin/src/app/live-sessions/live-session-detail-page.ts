import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { getDoc, getDocs } from 'firebase/firestore';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { PrincipalStore } from '@forge/auth';
import { coursesCol, liveSessionDoc } from '@forge/data-access';
import type { Course, LiveSession, LiveSessionStatus, LiveSessionType } from '@forge/shared';

interface ScheduleLiveSessionData {
  courseId?: string;
  title: string;
  description?: string;
  type: LiveSessionType;
  scheduledStart: string;
  durationMin: number;
}

interface ScheduleLiveSessionResult {
  sessionId: string;
  joinUrl: string;
  status: 'scheduled';
}

interface GetHostStartUrlResult {
  startUrl: string;
}

interface SelectOption<T> {
  label: string;
  value: T;
}

/** Pulls the `functions/<code>` suffix off a callable error, if present. */
function callableErrorCode(err: unknown): string | undefined {
  const raw =
    typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
  return raw?.includes('/') ? raw.slice(raw.indexOf('/') + 1) : raw;
}

/** Maps a callable error onto human-readable copy. */
function friendlyCallableError(err: unknown): string {
  switch (callableErrorCode(err)) {
    case 'unavailable':
      return 'Zoom is not configured for this environment, so the session cannot be created. Ask an administrator to add the Zoom credentials.';
    case 'permission-denied':
      return 'You do not have permission to schedule live sessions.';
    case 'invalid-argument':
      return 'Some details look invalid. Please review the form and try again.';
    case 'unauthenticated':
      return 'Your session has expired. Sign in again and retry.';
    default:
      return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
  }
}

/**
 * Schedule / manage a single live session. `:sessionId === 'new'` shows the
 * create form; an existing id loads the session, shows its status, and (for a
 * scheduled/live session) offers "Start as host" — which fetches the sensitive
 * host `startUrl` on demand via the `getHostStartUrl` callable and opens Zoom in
 * a new tab. The `startUrl` is never read from the session doc.
 */
@Component({
  selector: 'app-live-session-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    LowerCasePipe,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
  ],
  templateUrl: './live-session-detail-page.html',
  styleUrl: './live-session-detail-page.scss',
})
export class LiveSessionDetailPage {
  private readonly db = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly principal = inject(PrincipalStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Route param `:sessionId` (`'new'` for the create form). */
  private readonly sessionId = signal(this.route.snapshot.paramMap.get('sessionId') ?? 'new');

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly startingHost = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly existing = signal<LiveSession | undefined>(undefined);
  protected readonly session = computed(() => this.existing());
  protected readonly isNew = computed(() => this.sessionId() === 'new');
  /** Editing (status/host actions) is only meaningful for an active session. */
  protected readonly canHost = computed(() => {
    const status = this.existing()?.status;
    return status === 'scheduled' || status === 'live';
  });

  // Form model (template-driven via [(ngModel)]).
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly type = signal<LiveSessionType>('meeting');
  protected readonly courseId = signal<string | null>(null);
  protected readonly scheduledStart = signal<Date | null>(null);
  protected readonly durationMin = signal<number>(60);

  protected readonly typeOptions: SelectOption<LiveSessionType>[] = [
    { label: 'Meeting', value: 'meeting' },
    { label: 'Webinar', value: 'webinar' },
  ];
  protected readonly courseOptions = signal<SelectOption<string | null>[]>([
    { label: 'No course (standalone)', value: null },
  ]);

  /** Earliest selectable start: now (no scheduling in the past). */
  protected readonly minDate = new Date();

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    const tenantId = this.principal.tenantId();
    if (!tenantId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    try {
      await this.loadCourses(tenantId);
      if (!this.isNew()) {
        const snap = await getDoc(liveSessionDoc(this.db, tenantId, this.sessionId()));
        if (snap.exists()) {
          this.applySession(snap.data());
        } else {
          this.notFound.set(true);
        }
      }
    } catch {
      this.error.set('We couldn’t load this page. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCourses(tenantId: string): Promise<void> {
    try {
      const snap = await getDocs(coursesCol(this.db, tenantId));
      const courses = snap.docs.map((d) => d.data() as Course);
      this.courseOptions.set([
        { label: 'No course (standalone)', value: null },
        ...courses.map((course) => ({ label: course.title, value: course.id })),
      ]);
    } catch {
      // Non-fatal: scheduling without a course is allowed.
    }
  }

  private applySession(session: LiveSession): void {
    this.existing.set(session);
    this.title.set(session.title);
    this.description.set(session.description ?? '');
    this.type.set(session.type);
    this.courseId.set(session.courseId ?? null);
    this.scheduledStart.set(new Date(session.scheduledStart));
    this.durationMin.set(session.durationMin);
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    const title = this.title().trim();
    const start = this.scheduledStart();
    const durationMin = this.durationMin();
    if (!title || !start || !durationMin || durationMin < 1) {
      this.error.set('Add a title, a start time, and a duration of at least one minute.');
      return;
    }

    const data: ScheduleLiveSessionData = {
      title,
      type: this.type(),
      scheduledStart: start.toISOString(),
      durationMin,
    };
    const description = this.description().trim();
    if (description) data.description = description;
    const courseId = this.courseId();
    if (courseId) data.courseId = courseId;

    this.saving.set(true);
    this.error.set(null);
    try {
      const callable = httpsCallable<ScheduleLiveSessionData, ScheduleLiveSessionResult>(
        this.functions,
        'scheduleLiveSession',
      );
      await callable(data);
      await this.router.navigate(['/live-sessions']);
    } catch (err) {
      this.error.set(friendlyCallableError(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected async startAsHost(): Promise<void> {
    if (this.startingHost()) return;
    this.startingHost.set(true);
    this.error.set(null);
    try {
      const callable = httpsCallable<{ sessionId: string }, GetHostStartUrlResult>(
        this.functions,
        'getHostStartUrl',
      );
      const result = await callable({ sessionId: this.sessionId() });
      window.open(result.data.startUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      this.error.set(friendlyCallableError(err));
    } finally {
      this.startingHost.set(false);
    }
  }

  protected back(): void {
    void this.router.navigate(['/live-sessions']);
  }

  protected statusLabel(status: LiveSessionStatus): string {
    switch (status) {
      case 'live':
        return 'Live';
      case 'scheduled':
        return 'Scheduled';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Ended';
    }
  }
}
