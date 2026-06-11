import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { TooltipModule } from 'primeng/tooltip';
import type { CatalogProduct } from '@forge/shared';
import { CatalogAdminService } from './catalog-admin.service';
import { ProductEditorDialog } from './product-editor-dialog';
import { grantsChipLabel, modeChipLabel, sortProducts, upsertProduct } from './catalog.utils';

interface Toast {
  kind: 'positive' | 'negative';
  text: string;
}

/**
 * B2C catalog curation: every catalog doc (published and draft) as a row with
 * grants / mode chips, the Stripe price id, an inline publish toggle, and
 * edit / delete actions. Access is gated by authGuard + roleGuard('superadmin')
 * in the route config; Firestore I/O lives in {@link CatalogAdminService}.
 */
@Component({
  selector: 'app-catalog-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [
    FormsModule,
    ButtonModule,
    ConfirmDialogModule,
    ToggleButtonModule,
    TooltipModule,
    ProductEditorDialog,
  ],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
})
export class CatalogPage implements OnInit {
  private readonly catalog = inject(CatalogAdminService);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly products = signal<CatalogProduct[]>([]);
  protected readonly loading = signal(true);
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<CatalogProduct | null>(null);
  /** id of the row with an in-flight publish toggle (disables its button). */
  protected readonly togglePending = signal<string | null>(null);
  protected readonly toast = signal<Toast | null>(null);

  protected readonly grantsChipLabel = grantsChipLabel;
  protected readonly modeChipLabel = modeChipLabel;
  protected readonly skeletonRows = [0, 1, 2, 3];

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    try {
      this.products.set(sortProducts(await this.catalog.list()));
    } catch (err) {
      this.showToast(
        'negative',
        err instanceof Error
          ? `Could not load the catalog: ${err.message}`
          : 'Could not load the catalog.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected createProduct(): void {
    this.editing.set(null);
    this.editorOpen.set(true);
  }

  protected edit(product: CatalogProduct): void {
    this.editing.set(product);
    this.editorOpen.set(true);
  }

  protected onSaved(product: CatalogProduct): void {
    this.products.update((products) => upsertProduct(products, product));
    this.showToast('positive', `Saved “${product.title}”.`);
  }

  protected async togglePublished(product: CatalogProduct, published: boolean): Promise<void> {
    if (published === product.published || this.togglePending() === product.id) return;
    const previous = this.products();
    const updated: CatalogProduct = {
      ...product,
      published,
      updatedAt: new Date().toISOString(),
    };
    this.togglePending.set(product.id);
    // Optimistic flip, rolled back below if the write is rejected.
    this.products.update((products) => upsertProduct(products, updated));
    try {
      await this.catalog.save(updated);
      this.showToast(
        'positive',
        published
          ? `“${product.title}” is now live on the storefront.`
          : `“${product.title}” is back to draft.`,
      );
    } catch (err) {
      // Roll back with a *cloned* row: the template tracks rows by object
      // identity, so the clone re-creates the row and resets the toggle's
      // internal checked state (which already flipped on click).
      this.products.set(previous.map((p) => (p.id === product.id ? { ...p } : p)));
      this.showToast(
        'negative',
        err instanceof Error ? err.message : 'Publish change failed. Please try again.',
      );
    } finally {
      this.togglePending.set(null);
    }
  }

  protected confirmDelete(product: CatalogProduct): void {
    this.confirmation.confirm({
      header: 'Delete product',
      message: `Remove “${product.title}” from the storefront catalog? This cannot be undone.`,
      icon: 'pi pi-trash',
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', text: true },
      accept: () => {
        void this.remove(product);
      },
    });
  }

  protected excerpt(text: string): string {
    if (text.length <= 110) return text;
    return `${text.slice(0, 110).trimEnd()}…`;
  }

  private async remove(product: CatalogProduct): Promise<void> {
    try {
      await this.catalog.delete(product.id);
      this.products.update((products) => products.filter((p) => p.id !== product.id));
      this.showToast('positive', `Deleted “${product.title}”.`);
    } catch (err) {
      this.showToast(
        'negative',
        err instanceof Error ? err.message : 'Delete failed. Please try again.',
      );
    }
  }

  private showToast(kind: Toast['kind'], text: string): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toast.set({ kind, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 5000);
  }
}
