import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { getDocs } from 'firebase/firestore';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { PrincipalStore } from '@forge/auth';
import { liveSessionsCol } from '@forge/data-access';
import type { LiveSession, LiveSessionStatus } from '@forge/shared';

interface CancelLiveSessionResult {
  sessionId: string;
  status: 'canceled';
}

/**
 * Live sessions home for admins/instructors: every scheduled Zoom session for
 * the tenant, ordered by start time, with quick scheduling and cancel actions.
 * Mirrors the Studio course list idiom (signals + computed, OnPush, PrimeNG,
 * design tokens). The host `startUrl` is never on these docs and is never read
 * here — it is surfaced only from the detail page via the `getHostStartUrl`
 * callable.
 */
@Component({
  selector: 'app-live-sessions-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [ButtonModule, ConfirmDialogModule, TooltipModule],
  templateUrl: './live-sessions-list-page.html',
  styleUrl: './live-sessions-list-page.scss',
})
export class LiveSessionsListPage {
  private readonly db = inject(Firestore);
  private readonly functions = inject(Functions);
  private readonly principal = inject(PrincipalStore);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  private readonly data = signal<LiveSession[]>([]);

  /** Sessions ordered by start time (soonest first). */
  protected readonly sessions = computed(() =>
    [...this.data()].sort((a, b) => Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart)),
  );

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
    this.error.set(false);
    try {
      const snap = await getDocs(liveSessionsCol(this.db, tenantId));
      this.data.set(snap.docs.map((d) => d.data()));
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected schedule(): void {
    void this.router.navigate(['/live-sessions', 'new']);
  }

  protected open(session: LiveSession): void {
    void this.router.navigate(['/live-sessions', session.id]);
  }

  protected confirmCancel(session: LiveSession, event: Event): void {
    event.stopPropagation();
    this.confirmation.confirm({
      header: 'Cancel session',
      message: `Cancel “${session.title}”? Learners will no longer be able to join.`,
      icon: 'pi pi-times-circle',
      acceptButtonProps: { label: 'Cancel session', severity: 'danger' },
      rejectButtonProps: { label: 'Keep session', severity: 'secondary', text: true },
      accept: () => {
        void this.cancel(session);
      },
    });
  }

  private async cancel(session: LiveSession): Promise<void> {
    try {
      const callable = httpsCallable<{ sessionId: string }, CancelLiveSessionResult>(
        this.functions,
        'cancelLiveSession',
      );
      await callable({ sessionId: session.id });
      await this.load();
    } catch {
      this.error.set(true);
    }
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

  protected typeLabel(type: LiveSession['type']): string {
    return type === 'webinar' ? 'Webinar' : 'Meeting';
  }

  protected formatStart(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}
