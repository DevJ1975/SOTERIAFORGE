import type { ZodIssue } from 'zod';
import { catalogProduct } from '@forge/shared';
import type { CatalogProduct } from '@forge/shared';

export type GrantsKind = CatalogProduct['grants']['kind'];
export type CheckoutMode = CatalogProduct['mode'];

/** Flat, editable representation of a catalog product used by the editor form. */
export interface ProductFormModel {
  title: string;
  description: string;
  grantsKind: GrantsKind;
  grantsRefId: string;
  stripePriceId: string;
  mode: CheckoutMode;
  previewUrl: string;
  published: boolean;
}

export type ProductField = keyof ProductFormModel;
/** Per-field messages plus a catch-all 'form' bucket for unmapped issues. */
export type ProductFieldErrors = Partial<Record<ProductField | 'form', string>>;

// Mutable array type: PrimeNG's p-select [options] input rejects readonly arrays.
export const GRANTS_KIND_OPTIONS: { label: string; value: GrantsKind }[] = [
  { label: 'Course', value: 'course' },
  { label: 'Module', value: 'module' },
  { label: 'All access', value: 'all_access' },
];

export const MODE_OPTIONS: { label: string; value: CheckoutMode }[] = [
  { label: 'One-time', value: 'payment' },
  { label: 'Subscription', value: 'subscription' },
];

/** Defaults for a brand-new product: an unpublished one-time course unlock. */
export function newProductForm(): ProductFormModel {
  return {
    title: '',
    description: '',
    grantsKind: 'course',
    grantsRefId: '',
    stripePriceId: '',
    mode: 'payment',
    previewUrl: '',
    published: false,
  };
}

/** Flattens a stored product into the editor form model. */
export function productToForm(product: CatalogProduct): ProductFormModel {
  return {
    title: product.title,
    description: product.description,
    grantsKind: product.grants.kind,
    grantsRefId: product.grants.refId ?? '',
    stripePriceId: product.stripePriceId,
    mode: product.mode,
    previewUrl: product.previewUrl ?? '',
    published: product.published,
  };
}

/** New catalog ids follow the 'prod-' convention so docs are self-describing. */
export function createProductId(): string {
  return `prod-${Math.random().toString(36).slice(2, 10)}`;
}

export function grantsChipLabel(kind: GrantsKind): string {
  return GRANTS_KIND_OPTIONS.find((option) => option.value === kind)?.label ?? kind;
}

export function modeChipLabel(mode: CheckoutMode): string {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;
}

/** Newest first, title as a stable tiebreak. */
export function sortProducts(products: CatalogProduct[]): CatalogProduct[] {
  return [...products].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title),
  );
}

/** Replaces (or inserts) a product, keeping the list sorted. */
export function upsertProduct(
  products: CatalogProduct[],
  product: CatalogProduct,
): CatalogProduct[] {
  return sortProducts([...products.filter((p) => p.id !== product.id), product]);
}

const FIELD_BY_ISSUE_PATH: Record<string, ProductField> = {
  title: 'title',
  description: 'description',
  'grants.kind': 'grantsKind',
  'grants.refId': 'grantsRefId',
  stripePriceId: 'stripePriceId',
  mode: 'mode',
  previewUrl: 'previewUrl',
  published: 'published',
};

/** Rewrites zod's generic wording into form-friendly copy. */
function friendlyIssueMessage(issue: ZodIssue): string {
  if (issue.code === 'too_small' && issue.type === 'string') return 'Required.';
  if (issue.code === 'too_big' && issue.type === 'string') {
    return `Keep this under ${issue.maximum} characters.`;
  }
  if (issue.code === 'invalid_string' && issue.validation === 'url') {
    return 'Enter a valid URL (https://…).';
  }
  return issue.message;
}

/**
 * Maps zod issues onto editor fields ('grants.refId' → grantsRefId, …).
 * Issues without a known field land in the 'form' bucket; the first message
 * per field wins.
 */
export function zodIssuesToFieldErrors(issues: ZodIssue[]): ProductFieldErrors {
  const errors: ProductFieldErrors = {};
  for (const issue of issues) {
    const field = FIELD_BY_ISSUE_PATH[issue.path.join('.')] ?? 'form';
    errors[field] ??= friendlyIssueMessage(issue);
  }
  return errors;
}

export type BuildProductResult =
  | { product: CatalogProduct; errors: null }
  | { product: null; errors: ProductFieldErrors };

/**
 * Builds a schema-valid {@link CatalogProduct} from the editor form, or the
 * per-field error map when validation fails.
 *
 * - New products (no `existing`) get a fresh 'prod-' id and `createdAt: now`.
 * - Edits keep id / createdAt / createdBy and stamp `updatedAt: now`.
 * - course/module grants require a refId (the schema leaves it optional, but
 *   a course unlock without a course id would grant nothing).
 */
export function buildProduct(
  form: ProductFormModel,
  existing: CatalogProduct | null,
  now: string = new Date().toISOString(),
): BuildProductResult {
  const refId = form.grantsRefId.trim();
  const previewUrl = form.previewUrl.trim();
  const needsRef = form.grantsKind !== 'all_access';

  const errors: ProductFieldErrors = {};
  if (needsRef && !refId) {
    errors.grantsRefId = `Enter the ${form.grantsKind} id this purchase unlocks.`;
  }

  const candidate = {
    id: existing?.id ?? createProductId(),
    title: form.title.trim(),
    description: form.description.trim(),
    grants: { kind: form.grantsKind, ...(needsRef && refId ? { refId } : {}) },
    stripePriceId: form.stripePriceId.trim(),
    mode: form.mode,
    ...(previewUrl ? { previewUrl } : {}),
    published: form.published,
    createdAt: existing?.createdAt ?? now,
    ...(existing?.createdBy ? { createdBy: existing.createdBy } : {}),
    updatedAt: now,
  };

  const parsed = catalogProduct.safeParse(candidate);
  if (!parsed.success) {
    const mapped = zodIssuesToFieldErrors(parsed.error.issues);
    for (const key of Object.keys(mapped) as (ProductField | 'form')[]) {
      errors[key] ??= mapped[key];
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) {
    return { product: null, errors };
  }
  return { product: parsed.data, errors: null };
}
