import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleButtonModule } from 'primeng/togglebutton';
import type { CatalogProduct } from '@forge/shared';
import { CatalogAdminService } from './catalog-admin.service';
import {
  buildProduct,
  GRANTS_KIND_OPTIONS,
  MODE_OPTIONS,
  newProductForm,
  productToForm,
  type CheckoutMode,
  type GrantsKind,
  type ProductFieldErrors,
  type ProductFormModel,
} from './catalog.utils';

/**
 * Modal product editor for the B2C catalog. Pass `product = null` for a new
 * product (id generated on save) or an existing doc to edit. Validation runs
 * through the shared `catalogProduct` zod schema (via {@link buildProduct})
 * and surfaces inline, per field. Emits the saved product on success.
 */
@Component({
  selector: 'app-product-editor-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    ToggleButtonModule,
  ],
  template: `
    <p-dialog
      [header]="product() ? 'Edit product' : 'New product'"
      [modal]="true"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [draggable]="false"
      [style]="{ width: 'min(540px, 94vw)' }"
    >
      <form class="editor-form" (ngSubmit)="submit()">
        <label class="field">
          <span>Title</span>
          <input
            pInputText
            type="text"
            name="title"
            [(ngModel)]="title"
            autocomplete="off"
            placeholder="Fire Safety Fundamentals"
          />
          @if (errors().title; as message) {
            <small class="field-error" role="alert">{{ message }}</small>
          }
        </label>

        <label class="field">
          <span>Description</span>
          <textarea
            pTextarea
            name="description"
            rows="4"
            [(ngModel)]="description"
            placeholder="What the buyer gets — shown on the storefront."
          ></textarea>
          @if (errors().description; as message) {
            <small class="field-error" role="alert">{{ message }}</small>
          }
        </label>

        <div class="field-row">
          <div class="field">
            <span>Grants</span>
            <p-select
              name="grantsKind"
              ariaLabel="Grants"
              [(ngModel)]="grantsKind"
              [options]="grantsKindOptions"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
            @if (errors().grantsKind; as message) {
              <small class="field-error" role="alert">{{ message }}</small>
            }
          </div>

          <div class="field">
            <span>Checkout mode</span>
            <p-select
              name="mode"
              ariaLabel="Checkout mode"
              [(ngModel)]="mode"
              [options]="modeOptions"
              optionLabel="label"
              optionValue="value"
              appendTo="body"
              [style]="{ width: '100%' }"
            />
            @if (errors().mode; as message) {
              <small class="field-error" role="alert">{{ message }}</small>
            }
          </div>
        </div>

        @if (grantsKind() !== 'all_access') {
          <label class="field">
            <span>{{ grantsKind() === 'course' ? 'Course id' : 'Module id' }}</span>
            <input
              pInputText
              type="text"
              name="grantsRefId"
              [(ngModel)]="grantsRefId"
              autocomplete="off"
              placeholder="course-fire-safety"
            />
            <small class="hint">The courseDrafts id this purchase unlocks</small>
            @if (errors().grantsRefId; as message) {
              <small class="field-error" role="alert">{{ message }}</small>
            }
          </label>
        }

        <label class="field">
          <span>Stripe price id</span>
          <input
            pInputText
            type="text"
            name="stripePriceId"
            class="mono"
            [(ngModel)]="stripePriceId"
            autocomplete="off"
            placeholder="price_…"
          />
          <small class="hint">
            Create the Price in the Stripe dashboard (test mode) and paste its id
          </small>
          @if (errors().stripePriceId; as message) {
            <small class="field-error" role="alert">{{ message }}</small>
          }
        </label>

        <label class="field">
          <span>Preview URL <em>(optional)</em></span>
          <input
            pInputText
            type="url"
            name="previewUrl"
            [(ngModel)]="previewUrl"
            autocomplete="off"
            placeholder="https://…"
          />
          @if (errors().previewUrl; as message) {
            <small class="field-error" role="alert">{{ message }}</small>
          }
        </label>

        <div class="field publish">
          <span>Visibility</span>
          <p-togglebutton
            name="published"
            onLabel="Published"
            offLabel="Draft"
            onIcon="pi pi-eye"
            offIcon="pi pi-eye-slash"
            ariaLabel="Published"
            [(ngModel)]="published"
          />
          <small class="hint">Only published products appear on the storefront.</small>
        </div>

        @if (errors().form; as message) {
          <p class="form-error" role="alert">{{ message }}</p>
        }

        <div class="actions">
          <p-button
            type="button"
            label="Cancel"
            severity="secondary"
            [text]="true"
            [disabled]="pending()"
            (onClick)="close()"
          />
          <p-button type="submit" label="Save product" icon="pi pi-check" [loading]="pending()" />
        </div>
      </form>
    </p-dialog>
  `,
  styles: `
    .editor-form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-top: 4px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: var(--forge-font);
      font-size: 13px;
      font-weight: 600;
      color: var(--forge-text-subtle);

      em {
        font-style: normal;
        font-weight: 400;
      }

      input,
      textarea {
        width: 100%;
        transition:
          border-color 130ms ease-out,
          box-shadow 130ms ease-out;
      }

      input.mono {
        font-family: var(--forge-font-mono, ui-monospace, monospace);
      }

      textarea {
        resize: vertical;
      }
    }

    .field-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }

    .publish {
      align-items: flex-start;
    }

    .hint {
      font-weight: 400;
      font-size: 12px;
      color: var(--sf-muted, var(--forge-text-subtle));
    }

    .field-error {
      font-weight: 600;
      font-size: 12px;
      color: var(--forge-negative);
    }

    .form-error {
      margin: 0;
      padding: 10px 12px;
      border-radius: var(--forge-radius);
      background: color-mix(in srgb, var(--forge-negative) 10%, transparent);
      color: var(--forge-negative);
      font-size: 13px;
      font-weight: 600;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 4px;
    }
  `,
})
export class ProductEditorDialog {
  private readonly catalog = inject(CatalogAdminService);

  /** Two-way visibility (used with `[visible]` / `(visibleChange)`). */
  readonly visible = model(false);
  /** Product being edited, or null to create a new one. */
  readonly product = input<CatalogProduct | null>(null);
  /** Emits the persisted product after a successful save. */
  readonly saved = output<CatalogProduct>();

  protected readonly grantsKindOptions = GRANTS_KIND_OPTIONS;
  protected readonly modeOptions = MODE_OPTIONS;

  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly grantsKind = signal<GrantsKind>('course');
  protected readonly grantsRefId = signal('');
  protected readonly stripePriceId = signal('');
  protected readonly mode = signal<CheckoutMode>('payment');
  protected readonly previewUrl = signal('');
  protected readonly published = signal(false);

  protected readonly errors = signal<ProductFieldErrors>({});
  protected readonly pending = signal(false);

  private readonly formValue = computed<ProductFormModel>(() => ({
    title: this.title(),
    description: this.description(),
    grantsKind: this.grantsKind(),
    grantsRefId: this.grantsRefId(),
    stripePriceId: this.stripePriceId(),
    mode: this.mode(),
    previewUrl: this.previewUrl(),
    published: this.published(),
  }));

  constructor() {
    // Re-seed the form every time the dialog opens (new product or edit).
    effect(() => {
      if (!this.visible()) return;
      const product = this.product();
      untracked(() => this.applyForm(product ? productToForm(product) : newProductForm()));
    });
  }

  protected onVisibleChange(visible: boolean): void {
    this.visible.set(visible);
  }

  protected close(): void {
    this.visible.set(false);
  }

  protected async submit(): Promise<void> {
    if (this.pending()) return;

    const result = buildProduct(this.formValue(), this.product());
    if (!result.product) {
      this.errors.set(result.errors);
      return;
    }

    this.pending.set(true);
    this.errors.set({});
    try {
      await this.catalog.save(result.product);
      this.saved.emit(result.product);
      this.visible.set(false);
    } catch (err) {
      this.errors.set({
        form: err instanceof Error ? err.message : 'Save failed. Please try again.',
      });
    } finally {
      this.pending.set(false);
    }
  }

  private applyForm(form: ProductFormModel): void {
    this.title.set(form.title);
    this.description.set(form.description);
    this.grantsKind.set(form.grantsKind);
    this.grantsRefId.set(form.grantsRefId);
    this.stripePriceId.set(form.stripePriceId);
    this.mode.set(form.mode);
    this.previewUrl.set(form.previewUrl);
    this.published.set(form.published);
    this.errors.set({});
    this.pending.set(false);
  }
}
