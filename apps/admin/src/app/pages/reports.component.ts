import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import {
  type ApiMember,
  type EnrollmentReportRow,
  MemberAdminService,
  adminErrorMessage,
  ReportsApi,
} from '@assurance/tenant';
import { toCsv } from '@assurance/shared';

@Component({
  selector: 'assurance-admin-reports',
  standalone: true,
  imports: [ButtonModule, TableModule, DatePipe],
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
              <th>Course</th>
              <th>Progress</th>
              <th>Completed</th>
              <th>Due</th>
              <th>Last activity</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td>{{ r.memberName || '—' }}</td>
              <td>{{ r.email }}</td>
              <td>{{ r.courseTitle }}</td>
              <td>{{ r.progressPct }}%</td>
              <td>{{ r.completedAt ? (r.completedAt | date: 'mediumDate') : '—' }}</td>
              <td>{{ r.dueAt ? (r.dueAt | date: 'mediumDate') : '—' }}</td>
              <td>{{ r.lastActivityAt ? (r.lastActivityAt | date: 'medium') : '—' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="7">No enrollment data found.</td>
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
  private readonly memberAdmin = inject(MemberAdminService);
  private readonly reportsApi = inject(ReportsApi);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly members = signal<ApiMember[]>([]);
  protected readonly rows = signal<EnrollmentReportRow[]>([]);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [members, rows] = await Promise.all([
        this.memberAdmin.listMembers(),
        this.reportsApi.enrollments(),
      ]);
      this.members.set(members);
      this.rows.set(rows);
    } catch (err) {
      this.error.set(adminErrorMessage(err, 'Failed to load report data'));
    } finally {
      this.loading.set(false);
    }
  }

  protected exportMembers(): void {
    const csv = toCsv(
      this.members().map((m) => ({
        id: m.id,
        displayName: m.displayName,
        email: m.email,
        status: m.status,
        role: m.role,
      })),
      ['id', 'displayName', 'email', 'status', 'role'],
    );
    this.triggerDownload(csv, 'members.csv');
  }

  protected exportEnrollments(): void {
    const csv = toCsv(
      this.rows().map((r) => ({
        memberId: r.memberId,
        memberName: r.memberName,
        email: r.email,
        courseId: r.courseId,
        courseTitle: r.courseTitle,
        progressPct: r.progressPct,
        completedAt: r.completedAt ?? '',
        dueAt: r.dueAt ?? '',
        lastActivityAt: r.lastActivityAt ?? '',
      })),
      [
        'memberId',
        'memberName',
        'email',
        'courseId',
        'courseTitle',
        'progressPct',
        'completedAt',
        'dueAt',
        'lastActivityAt',
      ],
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
