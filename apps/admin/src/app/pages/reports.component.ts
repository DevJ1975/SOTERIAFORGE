import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MemberRepository, EnrollmentRepository } from '@assurance/data-access';
import { TenantService } from '@assurance/auth';
import { toCsv } from '@assurance/shared';
import type { Member, Enrollment } from '@assurance/shared';

interface LearnerRow {
  uid: string;
  displayName: string;
  email: string;
  xp: number;
  level: number;
  streakDays: number;
  enrollments: number;
  completed: number;
}

@Component({
  selector: 'assurance-admin-reports',
  standalone: true,
  imports: [ButtonModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="reports">
      <h1>Reports</h1>

      <div class="reports__actions">
        <p-button
          label="Export Members CSV"
          icon="pi pi-download"
          severity="secondary"
          [disabled]="loading()"
          (onClick)="exportMembers()"
        />
        <p-button
          label="Export Enrollments CSV"
          icon="pi pi-download"
          severity="secondary"
          [disabled]="loading()"
          (onClick)="exportEnrollments()"
        />
      </div>

      @if (loading()) {
        <p>Loading report data…</p>
      } @else if (error()) {
        <p class="reports__error">{{ error() }}</p>
      } @else {
        <p-table
          [value]="rows()"
          [paginator]="rows().length > 20"
          [rows]="20"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>XP</th>
              <th>Level</th>
              <th>Streak (days)</th>
              <th>Enrollments</th>
              <th>Completed</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td>{{ r.displayName || '—' }}</td>
              <td>{{ r.email }}</td>
              <td>{{ r.xp }}</td>
              <td>{{ r.level }}</td>
              <td>{{ r.streakDays }}</td>
              <td>{{ r.enrollments }}</td>
              <td>{{ r.completed }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7">No learner data found.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .reports {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .reports__actions {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .reports__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class ReportsComponent implements OnInit {
  private readonly memberRepo = inject(MemberRepository);
  private readonly enrollmentRepo = inject(EnrollmentRepository);
  private readonly tenantService = inject(TenantService);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly members = signal<Member[]>([]);
  private readonly enrollments = signal<Enrollment[]>([]);

  protected readonly rows = computed<LearnerRow[]>(() => {
    const enrollsByUid = new Map<string, { total: number; completed: number }>();
    for (const e of this.enrollments()) {
      const prev = enrollsByUid.get(e.uid) ?? { total: 0, completed: 0 };
      enrollsByUid.set(e.uid, {
        total: prev.total + 1,
        completed: prev.completed + (e.completed ? 1 : 0),
      });
    }
    return this.members().map((m) => {
      const stats = enrollsByUid.get(m.uid) ?? { total: 0, completed: 0 };
      return {
        uid: m.uid,
        displayName: m.displayName ?? '',
        email: m.email,
        xp: m.xp,
        level: m.level,
        streakDays: m.streakDays,
        enrollments: stats.total,
        completed: stats.completed,
      };
    });
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const members = await this.memberRepo.listActive(tid);
      const enrollments = await this.enrollmentRepo.listForTenant(tid);
      this.members.set(members);
      this.enrollments.set(enrollments);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to load report data');
    } finally {
      this.loading.set(false);
    }
  }

  protected exportMembers(): void {
    const csv = toCsv(
      this.members().map((m) => ({
        uid: m.uid,
        displayName: m.displayName ?? '',
        email: m.email,
        xp: m.xp,
        level: m.level,
        streakDays: m.streakDays,
        status: m.status,
        role: m.role,
      })),
      ['uid', 'displayName', 'email', 'xp', 'level', 'streakDays', 'status', 'role'],
    );
    this.triggerDownload(csv, 'members.csv');
  }

  protected exportEnrollments(): void {
    const csv = toCsv(
      this.enrollments().map((e) => ({
        uid: e.uid,
        courseId: e.courseId,
        tenantId: e.tenantId,
        progressPct: e.progressPct,
        completed: e.completed,
        score: e.score ?? '',
        lastActivityAt: e.lastActivityAt ?? '',
      })),
      ['uid', 'courseId', 'tenantId', 'progressPct', 'completed', 'score', 'lastActivityAt'],
    );
    this.triggerDownload(csv, 'enrollments.csv');
  }

  private triggerDownload(csv: string, filename: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
