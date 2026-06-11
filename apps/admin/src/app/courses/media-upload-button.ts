import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Storage } from '@angular/fire/storage';
import { PrincipalStore } from '@forge/auth';
import {
  ForgeMediaUpload,
  mediaAccept,
  validateMediaFile,
  type MediaKind,
  type MediaUploadHandle,
} from '@forge/data-access';

/**
 * Inspector 'Upload' control: hidden file input feeding ForgeMediaUpload,
 * with an ember progress bar while the upload runs. Emits the resulting
 * download URL so the inspector can push it through the builder store's
 * commit flow (keeping undo/autosave intact).
 *
 * Hidden (with a hint) when there is no tenant to upload into — signed-out /
 * localStorage authoring mode — or when Firebase Storage is not provided.
 */
@Component({
  selector: 'app-media-upload-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (canUpload()) {
      @if (busy()) {
        <span class="up-row">
          <span
            class="up-track"
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-valuenow]="progress()"
          >
            <span class="up-bar" [style.width.%]="progress()"></span>
          </span>
          <span class="up-pct">{{ progress() }}%</span>
          <button type="button" class="up-cancel" (click)="cancel()" title="Cancel upload">
            <i class="pi pi-times"></i>
          </button>
        </span>
      } @else {
        <button type="button" class="up-btn" (click)="pickFile(file)">
          <i class="pi pi-upload"></i> Upload
        </button>
      }
      <input
        #file
        type="file"
        class="up-input"
        [accept]="accept()"
        (change)="onFileSelected($event)"
      />
    } @else {
      <small class="up-hint">Sign in to upload — or paste a URL</small>
    }
    @if (error(); as message) {
      <small class="up-error">{{ message }}</small>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 5px;
    }

    .up-input {
      display: none;
    }

    .up-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border: 1px solid var(--forge-border);
      border-radius: var(--forge-radius-small);
      background: var(--forge-surface);
      font: inherit;
      font-size: 12.5px;
      font-weight: 600;
      color: var(--forge-text-subtle);
      cursor: pointer;
      transition:
        border-color 130ms ease-out,
        color 130ms ease-out;

      .pi {
        font-size: 11px;
      }

      &:hover {
        border-color: var(--forge-accent);
        color: var(--forge-text);
      }
    }

    .up-row {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }

    /* Ember progress bar. */
    .up-track {
      flex: 1;
      height: 6px;
      border-radius: 999px;
      background: var(--forge-surface-dim);
      overflow: hidden;
    }

    .up-bar {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--forge-accent), var(--forge-notice));
      box-shadow: 0 0 8px color-mix(in srgb, var(--forge-accent) 60%, transparent);
      transition: width 160ms ease-out;
    }

    .up-pct {
      flex: 0 0 auto;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--forge-text-subtle);
    }

    .up-cancel {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--forge-text-subtle);
      cursor: pointer;

      .pi {
        font-size: 10px;
      }

      &:hover {
        background: var(--forge-surface-dim);
        color: var(--forge-text);
      }
    }

    .up-hint {
      font-size: 12px;
      color: var(--forge-text-subtle);
    }

    .up-error {
      font-size: 12px;
      color: var(--forge-negative);
    }
  `,
})
export class MediaUploadButton {
  /** What this control uploads; drives the accept filter and storage path. */
  readonly kind = input.required<MediaKind>();
  /** Fires with the download URL once an upload completes. */
  readonly uploaded = output<string>();

  private readonly storage = inject(Storage, { optional: true });
  private readonly principal = inject(PrincipalStore);
  private readonly uploader = inject(ForgeMediaUpload);

  private readonly handle = signal<MediaUploadHandle | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly accept = computed(() => mediaAccept(this.kind()));
  protected readonly canUpload = computed(
    () => this.storage !== null && this.principal.tenantId() !== null,
  );
  protected readonly busy = computed(() => this.handle()?.state() === 'running');
  protected readonly progress = computed(() => this.handle()?.progress() ?? 0);

  constructor() {
    // Relay terminal upload states: emit the URL on success, surface failures.
    effect(() => {
      const handle = this.handle();
      if (!handle) return;
      const state = handle.state();
      if (state === 'success') {
        const url = handle.downloadUrl();
        this.handle.set(null);
        if (url) this.uploaded.emit(url);
      } else if (state === 'error') {
        this.error.set(handle.error() ?? 'Upload failed.');
        this.handle.set(null);
      }
    });
  }

  protected pickFile(input: HTMLInputElement): void {
    this.error.set(null);
    input.click();
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again later
    const tenantId = this.principal.tenantId();
    if (!file || !this.storage || tenantId === null) return;

    const invalid = validateMediaFile(file, this.kind());
    if (invalid) {
      this.error.set(invalid);
      return;
    }
    this.error.set(null);
    this.handle.set(this.uploader.upload(this.storage, { tenantId, file, kind: this.kind() }));
  }

  protected cancel(): void {
    // Drop the handle first so the cancellation error is not surfaced.
    const handle = this.handle();
    this.handle.set(null);
    handle?.cancel();
  }
}
