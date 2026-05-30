import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { AnalyticsService } from '../services/analytics.service';
import type { PlatformAnalytics, TenantAnalyticsRow } from '../services/analytics.service';

@Component({
  selector: 'forge-superadmin-analytics',
  standalone: true,
  imports: [CardModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="analytics">
      <h1>Cross-tenant Analytics</h1>

      @if (loading()) {
        <p>Loading analytics…</p>
      } @else if (error()) {
        <p class="analytics__error">{{ error() }}</p>
      } @else if (data()) {
        <!-- Totals Cards -->
        <div class="analytics__totals">
          <p-card header="Tenants">
            <p class="analytics__metric">{{ data()!.totals.tenants }}</p>
          </p-card>
          <p-card header="Members">
            <p class="analytics__metric">{{ data()!.totals.members }}</p>
          </p-card>
          <p-card header="Enrollments">
            <p class="analytics__metric">{{ data()!.totals.enrollments }}</p>
          </p-card>
          <p-card header="Completions">
            <p class="analytics__metric">{{ data()!.totals.completions }}</p>
          </p-card>
        </div>

        <!-- Per-tenant Table -->
        <p-table
          [value]="tenantRows()"
          [paginator]="tenantRows().length > 20"
          [rows]="20"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Members</th>
              <th>Enrollments</th>
              <th>Completions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-t>
            <tr>
              <td>{{ t.name }}</td>
              <td>{{ t.status }}</td>
              <td>{{ t.plan }}</td>
              <td>{{ t.members }}</td>
              <td>{{ t.enrollments }}</td>
              <td>{{ t.completions }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6">No tenant data available.</td>
            </tr>
          </ng-template>
        </p-table>

        <p class="analytics__generated">Generated at: {{ data()!.generatedAt }}</p>
      }
    </section>
  `,
  styles: [
    `
      .analytics {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .analytics__totals {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
        gap: 1rem;
      }
      .analytics__metric {
        font-size: 2rem;
        font-weight: 700;
        text-align: center;
        margin: 0;
      }
      .analytics__error {
        color: #b00020;
      }
      .analytics__generated {
        font-size: 0.8rem;
        color: #6b7280;
        text-align: right;
      }
    `,
  ],
})
export class AnalyticsComponent implements OnInit {
  private readonly analyticsSvc = inject(AnalyticsService);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<PlatformAnalytics | null>(null);
  protected readonly tenantRows = signal<TenantAnalyticsRow[]>([]);

  ngOnInit(): void {
    void this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.analyticsSvc.load();
      this.data.set(result);
      this.tenantRows.set(result.tenants);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to load analytics');
    } finally {
      this.loading.set(false);
    }
  }
}
