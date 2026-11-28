import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { apiErrorMessage } from '../services/api-error';
import { type TenantRow, type TenantStatus, TenantsService } from '../services/tenants.service';

@Component({
  selector: 'assurance-superadmin-tenants',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="tenants">
      <h1>Tenant Management</h1>

      <!-- New Tenant Form -->
      <p-card header="New Tenant" styleClass="tenants__form-card">
        <div class="tenants__form">
          <input
            pInputText
            type="text"
            placeholder="Tenant ID (subdomain)"
            [(ngModel)]="newTenantId"
          />
          <input pInputText type="text" placeholder="Display Name" [(ngModel)]="newTenantName" />
          <input
            pInputText
            type="email"
            placeholder="First admin email (optional)"
            [(ngModel)]="newAdminEmail"
          />
          <input
            pInputText
            type="text"
            placeholder="Plan (e.g. starter)"
            [(ngModel)]="newTenantPlan"
          />
          <p-button
            label="Provision Tenant"
            [loading]="loading()"
            [disabled]="!newTenantId || !newTenantName"
            (onClick)="provision()"
          />
        </div>
        @if (error()) {
          <p class="tenants__error">{{ error() }}</p>
        }
      </p-card>

      <!-- Tenants Table -->
      @if (loading() && tenants().length === 0) {
        <p>Loading tenants…</p>
      } @else {
        <p-table
          [value]="tenants()"
          [tableStyle]="{ 'min-width': '50rem' }"
          styleClass="tenants__table"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>ID (Subdomain)</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-t>
            <tr>
              <td>{{ t.name }}</td>
              <td>{{ t.id }}</td>
              <td>{{ t.status }}</td>
              <td>{{ t.plan }}</td>
              <td>
                @if (t.status === 'active') {
                  <p-button
                    label="Suspend"
                    severity="warn"
                    size="small"
                    [loading]="loading()"
                    (onClick)="updateStatus(t.id, 'suspended')"
                  />
                }
                @if (t.status === 'suspended' || t.status === 'archived') {
                  <p-button
                    label="Activate"
                    severity="success"
                    size="small"
                    [loading]="loading()"
                    (onClick)="updateStatus(t.id, 'active')"
                  />
                }
                @if (t.status !== 'archived') {
                  <p-button
                    label="Archive"
                    severity="secondary"
                    size="small"
                    [loading]="loading()"
                    (onClick)="updateStatus(t.id, 'archived')"
                  />
                }
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">No tenants found.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .tenants {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .tenants__form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
      }
      .tenants__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class TenantsComponent implements OnInit {
  private readonly api = inject(TenantsService);

  protected readonly tenants = signal<TenantRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected newTenantId = '';
  protected newTenantName = '';
  protected newTenantPlan = '';
  protected newAdminEmail = '';

  async ngOnInit(): Promise<void> {
    await this.loadTenants();
  }

  private async loadTenants(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.tenants.set(await this.api.list());
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Failed to load tenants'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async provision(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.provision({
        id: this.newTenantId,
        name: this.newTenantName,
        plan: this.newTenantPlan || undefined,
        adminEmail: this.newAdminEmail || undefined,
      });
      this.newTenantId = '';
      this.newTenantName = '';
      this.newTenantPlan = '';
      this.newAdminEmail = '';
      await this.loadTenants();
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Failed to provision tenant'));
      this.loading.set(false);
    }
  }

  protected async updateStatus(
    tenantId: string,
    status: Exclude<TenantStatus, 'provisioning'>,
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.setStatus(tenantId, status);
      await this.loadTenants();
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Failed to update tenant status'));
      this.loading.set(false);
    }
  }
}
