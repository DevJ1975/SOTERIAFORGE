import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TableModule } from 'primeng/table';
import { CatalogRepository } from '@assurance/data-access';
import type { CatalogProduct } from '@assurance/shared';

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

@Component({
  selector: 'assurance-superadmin-catalog',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CardModule,
    CheckboxModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    TableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="catalog">
      <h1>B2C Catalog</h1>

      <!-- New Product Form -->
      <p-card header="New Product" styleClass="catalog__form-card">
        <div class="catalog__form">
          <input
            pInputText
            type="text"
            placeholder="Title"
            [(ngModel)]="newTitle"
            class="catalog__field--wide"
          />
          <textarea
            pTextarea
            placeholder="Description"
            rows="3"
            [(ngModel)]="newDescription"
            class="catalog__field--wide"
          ></textarea>
          <input
            pInputText
            type="text"
            placeholder="Stripe Price ID (e.g. price_xxx)"
            [(ngModel)]="newStripePriceId"
          />
          <p-select
            [options]="modeOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Mode"
            [(ngModel)]="newMode"
          />
          <p-select
            [options]="grantsKindOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Grants kind"
            [(ngModel)]="newGrantsKind"
          />
          <input
            pInputText
            type="text"
            placeholder="Ref ID (course or module id, optional)"
            [(ngModel)]="newGrantsRefId"
          />
          <div class="catalog__checkbox-row">
            <p-checkbox [(ngModel)]="newPublished" [binary]="true" inputId="newPublished" />
            <label for="newPublished">Published</label>
          </div>
          <p-button
            label="Create Product"
            [loading]="loading()"
            [disabled]="!newTitle || !newStripePriceId || !newMode || !newGrantsKind"
            (onClick)="create()"
          />
        </div>
        @if (error()) {
          <p class="catalog__error">{{ error() }}</p>
        }
      </p-card>

      <!-- Products Table -->
      @if (loading() && products().length === 0) {
        <p>Loading products…</p>
      } @else {
        <p-table
          [value]="products()"
          [tableStyle]="{ 'min-width': '60rem' }"
          styleClass="catalog__table"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th>
              <th>Mode</th>
              <th>Grants</th>
              <th>Stripe Price ID</th>
              <th>Published</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-p>
            <tr>
              <td>{{ p.title }}</td>
              <td>{{ p.mode }}</td>
              <td>{{ p.grants.kind }}{{ p.grants.refId ? ' / ' + p.grants.refId : '' }}</td>
              <td>{{ p.stripePriceId }}</td>
              <td>
                <p-checkbox
                  [ngModel]="p.published"
                  [binary]="true"
                  (onChange)="togglePublished(p, $event.checked)"
                />
              </td>
              <td>
                <p-button
                  label="Edit"
                  size="small"
                  severity="secondary"
                  [loading]="loading()"
                  (onClick)="startEdit(p)"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="6">No catalog products found.</td>
            </tr>
          </ng-template>
        </p-table>
      }

      <!-- Inline Edit Panel -->
      @if (editProduct()) {
        <p-card header="Edit Product" styleClass="catalog__form-card">
          <div class="catalog__form">
            <input
              pInputText
              type="text"
              placeholder="Title"
              [(ngModel)]="editTitle"
              class="catalog__field--wide"
            />
            <textarea
              pTextarea
              placeholder="Description"
              rows="3"
              [(ngModel)]="editDescription"
              class="catalog__field--wide"
            ></textarea>
            <input
              pInputText
              type="text"
              placeholder="Stripe Price ID"
              [(ngModel)]="editStripePriceId"
            />
            <p-select
              [options]="modeOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Mode"
              [(ngModel)]="editMode"
            />
            <p-select
              [options]="grantsKindOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Grants kind"
              [(ngModel)]="editGrantsKind"
            />
            <input
              pInputText
              type="text"
              placeholder="Ref ID (optional)"
              [(ngModel)]="editGrantsRefId"
            />
            <div class="catalog__checkbox-row">
              <p-checkbox [(ngModel)]="editPublished" [binary]="true" inputId="editPublished" />
              <label for="editPublished">Published</label>
            </div>
            <div class="catalog__actions-row">
              <p-button
                label="Save"
                [loading]="loading()"
                [disabled]="!editTitle || !editStripePriceId || !editMode || !editGrantsKind"
                (onClick)="saveEdit()"
              />
              <p-button
                label="Cancel"
                severity="secondary"
                [disabled]="loading()"
                (onClick)="cancelEdit()"
              />
            </div>
          </div>
          @if (error()) {
            <p class="catalog__error">{{ error() }}</p>
          }
        </p-card>
      }
    </section>
  `,
  styles: [
    `
      .catalog {
        max-width: 80rem;
        margin: 2rem auto;
        padding: 0 1rem;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }
      .catalog__form {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-start;
      }
      .catalog__field--wide {
        width: 100%;
        min-width: 20rem;
      }
      .catalog__checkbox-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .catalog__actions-row {
        display: flex;
        gap: 0.5rem;
      }
      .catalog__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class CatalogComponent implements OnInit {
  private readonly catalogRepo = inject(CatalogRepository);

  protected readonly products = signal<CatalogProduct[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly editProduct = signal<CatalogProduct | null>(null);

  // New product form fields
  protected newTitle = '';
  protected newDescription = '';
  protected newStripePriceId = '';
  protected newMode: 'payment' | 'subscription' | '' = '';
  protected newGrantsKind: 'course' | 'module' | 'all_access' | '' = '';
  protected newGrantsRefId = '';
  protected newPublished = false;

  // Edit form fields
  protected editTitle = '';
  protected editDescription = '';
  protected editStripePriceId = '';
  protected editMode: 'payment' | 'subscription' | '' = '';
  protected editGrantsKind: 'course' | 'module' | 'all_access' | '' = '';
  protected editGrantsRefId = '';
  protected editPublished = false;

  protected readonly modeOptions: SelectOption<'payment' | 'subscription'>[] = [
    { label: 'One-time payment', value: 'payment' },
    { label: 'Subscription', value: 'subscription' },
  ];

  protected readonly grantsKindOptions: SelectOption<'course' | 'module' | 'all_access'>[] = [
    { label: 'Course', value: 'course' },
    { label: 'Module', value: 'module' },
    { label: 'All Access', value: 'all_access' },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadProducts();
  }

  private async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.catalogRepo.listAll();
      this.products.set(result);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to load catalog products');
    } finally {
      this.loading.set(false);
    }
  }

  protected async create(): Promise<void> {
    if (!this.newTitle || !this.newStripePriceId || !this.newMode || !this.newGrantsKind) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const id = crypto.randomUUID();
      const product: CatalogProduct = {
        id,
        title: this.newTitle,
        description: this.newDescription,
        stripePriceId: this.newStripePriceId,
        mode: this.newMode as 'payment' | 'subscription',
        grants: {
          kind: this.newGrantsKind as 'course' | 'module' | 'all_access',
          ...(this.newGrantsRefId ? { refId: this.newGrantsRefId } : {}),
        },
        published: this.newPublished,
        createdAt: new Date().toISOString(),
      };
      await this.catalogRepo.set(id, product);
      this.newTitle = '';
      this.newDescription = '';
      this.newStripePriceId = '';
      this.newMode = '';
      this.newGrantsKind = '';
      this.newGrantsRefId = '';
      this.newPublished = false;
      await this.loadProducts();
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to create product');
      this.loading.set(false);
    }
  }

  protected async togglePublished(product: CatalogProduct, checked: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const updated: CatalogProduct = { ...product, published: checked };
      await this.catalogRepo.set(product.id!, updated);
      await this.loadProducts();
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to update product');
      this.loading.set(false);
    }
  }

  protected startEdit(product: CatalogProduct): void {
    this.editProduct.set(product);
    this.editTitle = product.title;
    this.editDescription = product.description ?? '';
    this.editStripePriceId = product.stripePriceId;
    this.editMode = product.mode;
    this.editGrantsKind = product.grants.kind;
    this.editGrantsRefId = product.grants.refId ?? '';
    this.editPublished = product.published;
  }

  protected cancelEdit(): void {
    this.editProduct.set(null);
  }

  protected async saveEdit(): Promise<void> {
    const original = this.editProduct();
    if (
      !original ||
      !this.editTitle ||
      !this.editStripePriceId ||
      !this.editMode ||
      !this.editGrantsKind
    )
      return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const updated: CatalogProduct = {
        ...original,
        title: this.editTitle,
        description: this.editDescription,
        stripePriceId: this.editStripePriceId,
        mode: this.editMode as 'payment' | 'subscription',
        grants: {
          kind: this.editGrantsKind as 'course' | 'module' | 'all_access',
          ...(this.editGrantsRefId ? { refId: this.editGrantsRefId } : {}),
        },
        published: this.editPublished,
        updatedAt: new Date().toISOString(),
      };
      await this.catalogRepo.set(original.id!, updated);
      this.editProduct.set(null);
      await this.loadProducts();
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to save product');
      this.loading.set(false);
    }
  }
}
