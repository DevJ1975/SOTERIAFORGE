import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { OFFLINE_VIDEO_PORT } from '@forge/lms-core';
import {
  CapacitorOfflineVideoAdapter,
  type OfflineDownload,
} from '../../offline/capacitor-offline-video.adapter';
import { NetworkStatusService } from '../../offline/network-status.service';

/**
 * "Downloads" page: manage videos saved for offline playback. Lists each
 * downloaded asset (a readable label derived from its Storage path + size),
 * shows total on-device usage, lets the learner remove a download, and surfaces
 * a live network-status indicator.
 *
 * On the web the offline port is unsupported, so the page explains that durable
 * downloads live in the installed native app and shows nothing to remove.
 */
@Component({
  selector: 'app-downloads',
  imports: [RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="forge-page">
      <header class="page-head">
        <div>
          <h1>Downloads</h1>
          <p class="muted">Course videos saved on this device for offline playback.</p>
        </div>
        <span
          class="net-chip"
          [class.offline]="!online()"
          role="status"
          [attr.aria-label]="online() ? 'Online' : 'Offline'"
        >
          <span class="net-dot" aria-hidden="true"></span>
          {{ online() ? 'Online' : 'Offline' }}
        </span>
      </header>

      @if (!supported()) {
        <div class="forge-card notice">
          <h2>Offline downloads live in the app</h2>
          <p class="muted">
            Saving videos for offline viewing is available in the installed Soteria FORGE app on iOS
            and Android. In your browser, course videos play online.
          </p>
          <p-button label="Browse courses" routerLink="/courses" severity="secondary" />
        </div>
      } @else {
        <section class="usage forge-card" aria-label="Storage usage">
          <div>
            <span class="usage-label">On-device usage</span>
            <span class="usage-value">{{ formatSize(totalBytes()) }}</span>
          </div>
          <span class="usage-count">{{ downloads().length }} video(s)</span>
        </section>

        @if (loading()) {
          <p class="muted">Loading your downloads…</p>
        } @else if (downloads().length === 0) {
          <div class="forge-card empty">
            <p class="muted">No videos downloaded yet.</p>
            <p class="muted small">
              Open a course with an uploaded video and choose “Download for offline”.
            </p>
            <p-button label="Browse courses" routerLink="/courses" />
          </div>
        } @else {
          <ul class="download-list">
            @for (item of downloads(); track item.storagePath) {
              <li class="forge-card download-row">
                <div class="download-meta">
                  <span class="download-title">{{ labelFor(item.storagePath) }}</span>
                  <span class="muted small">{{ formatSize(item.sizeBytes) }}</span>
                </div>
                <p-button
                  label="Remove"
                  icon="pi pi-trash"
                  severity="danger"
                  [text]="true"
                  [loading]="removing() === item.storagePath"
                  [attr.aria-label]="'Remove ' + labelFor(item.storagePath)"
                  (onClick)="remove(item)"
                />
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  styles: `
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .page-head h1 {
      margin: 0;
    }
    .muted {
      color: var(--forge-text-subtle);
      margin: 4px 0 0;
    }
    .small {
      font-size: 0.85rem;
    }
    .net-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border-radius: 999px;
      border: 1px solid var(--forge-border);
      background: var(--forge-surface-dim);
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--forge-text);
    }
    .net-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--forge-positive);
    }
    .net-chip.offline {
      border-color: var(--forge-notice);
    }
    .net-chip.offline .net-dot {
      background: var(--forge-notice);
    }
    .notice {
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-start;
      border: 1px solid var(--forge-notice);
    }
    .notice h2 {
      margin: 0;
    }
    .usage {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .usage-label {
      display: block;
      color: var(--forge-text-subtle);
      font-size: 0.85rem;
    }
    .usage-value {
      font-size: 1.4rem;
      font-weight: 700;
    }
    .usage-count {
      color: var(--forge-text-subtle);
      font-size: 0.9rem;
    }
    .download-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .download-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .download-meta {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    .download-title {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .empty {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-start;
    }
  `,
})
export class Downloads {
  // Inject the concrete adapter for its richer typed surface (listDownloads
  // returns storagePath + sizeBytes), and confirm it's the wired-up port.
  private readonly port = inject(OFFLINE_VIDEO_PORT);
  private readonly offline = inject(CapacitorOfflineVideoAdapter);
  private readonly network = inject(NetworkStatusService);

  protected readonly online = this.network.online;
  protected readonly supported = signal(this.port.supported());
  protected readonly loading = signal(true);
  protected readonly removing = signal<string | null>(null);
  private readonly items = signal<OfflineDownload[]>([]);

  protected readonly downloads = computed(() => this.items());
  protected readonly totalBytes = computed(() =>
    this.items().reduce((sum, d) => sum + (d.sizeBytes ?? 0), 0),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (!this.supported()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      this.items.set(await this.offline.listDownloads());
    } finally {
      this.loading.set(false);
    }
  }

  protected async remove(item: OfflineDownload): Promise<void> {
    this.removing.set(item.storagePath);
    try {
      await this.offline.remove(item.storagePath);
      this.items.update((list) => list.filter((d) => d.storagePath !== item.storagePath));
    } finally {
      this.removing.set(null);
    }
  }

  /** Human-friendly label from a Storage path (last segment without extension). */
  protected labelFor(storagePath: string): string {
    const file = storagePath.split('/').pop() ?? storagePath;
    return file.replace(/\.[^.]+$/, '') || storagePath;
  }

  /** Bytes → a compact, readable size (e.g. "12.4 MB"). */
  protected formatSize(bytes: number): string {
    if (!bytes) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }
}
