import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { BrandingService } from '@forge/tenant';
import { TenantRepository } from '@forge/data-access';
import { TenantService } from '@forge/auth';
import { ThemeService } from '@forge/ui';
import type { Branding } from '@forge/shared';

interface BrandingForm {
  logoUrl: string;
  faviconUrl: string;
  fontFamily: string;
  emailFromName: string;
  colorPrimary: string;
  colorSurface: string;
  colorAccent: string;
  colorText: string;
  colorTextMuted: string;
}

function formToBranding(form: BrandingForm): Branding {
  return {
    logoUrl: form.logoUrl || undefined,
    faviconUrl: form.faviconUrl || undefined,
    fontFamily: form.fontFamily || undefined,
    emailFromName: form.emailFromName || undefined,
    colors: {
      '--forge-color-primary': form.colorPrimary,
      '--forge-color-surface': form.colorSurface,
      '--forge-color-accent': form.colorAccent,
      '--forge-color-text': form.colorText,
      '--forge-color-text-muted': form.colorTextMuted,
    },
  };
}

@Component({
  selector: 'forge-admin-branding',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="branding">
      <h1>Branding</h1>

      @if (loading()) {
        <p>Loading branding…</p>
      } @else {
        <div class="branding__form">
          <!-- URLs -->
          <div class="branding__field">
            <label for="logoUrl">Logo URL</label>
            <input
              id="logoUrl"
              pInputText
              type="text"
              placeholder="https://…"
              [(ngModel)]="form().logoUrl"
              (ngModelChange)="patchForm('logoUrl', $event)"
            />
          </div>
          <div class="branding__field">
            <label for="faviconUrl">Favicon URL</label>
            <input
              id="faviconUrl"
              pInputText
              type="text"
              placeholder="https://…"
              [(ngModel)]="form().faviconUrl"
              (ngModelChange)="patchForm('faviconUrl', $event)"
            />
          </div>
          <div class="branding__field">
            <label for="fontFamily">Font Family</label>
            <input
              id="fontFamily"
              pInputText
              type="text"
              placeholder="Inter, sans-serif"
              [(ngModel)]="form().fontFamily"
              (ngModelChange)="patchForm('fontFamily', $event)"
            />
          </div>
          <div class="branding__field">
            <label for="emailFromName">Email From Name</label>
            <input
              id="emailFromName"
              pInputText
              type="text"
              placeholder="Acme Learning"
              [(ngModel)]="form().emailFromName"
              (ngModelChange)="patchForm('emailFromName', $event)"
            />
          </div>

          <!-- Colors -->
          <div class="branding__colors">
            <h2>Colors</h2>
            <div class="branding__color-row">
              <label for="colorPrimary">Primary</label>
              <input
                id="colorPrimary"
                type="color"
                [(ngModel)]="form().colorPrimary"
                (ngModelChange)="patchForm('colorPrimary', $event)"
                aria-label="Primary color"
              />
              <input
                pInputText
                type="text"
                [ngModel]="form().colorPrimary"
                (ngModelChange)="patchForm('colorPrimary', $event)"
                aria-label="Primary color hex"
              />
            </div>
            <div class="branding__color-row">
              <label for="colorSurface">Surface</label>
              <input
                id="colorSurface"
                type="color"
                [(ngModel)]="form().colorSurface"
                (ngModelChange)="patchForm('colorSurface', $event)"
                aria-label="Surface color"
              />
              <input
                pInputText
                type="text"
                [ngModel]="form().colorSurface"
                (ngModelChange)="patchForm('colorSurface', $event)"
                aria-label="Surface color hex"
              />
            </div>
            <div class="branding__color-row">
              <label for="colorAccent">Accent</label>
              <input
                id="colorAccent"
                type="color"
                [(ngModel)]="form().colorAccent"
                (ngModelChange)="patchForm('colorAccent', $event)"
                aria-label="Accent color"
              />
              <input
                pInputText
                type="text"
                [ngModel]="form().colorAccent"
                (ngModelChange)="patchForm('colorAccent', $event)"
                aria-label="Accent color hex"
              />
            </div>
            <div class="branding__color-row">
              <label for="colorText">Text</label>
              <input
                id="colorText"
                type="color"
                [(ngModel)]="form().colorText"
                (ngModelChange)="patchForm('colorText', $event)"
                aria-label="Text color"
              />
              <input
                pInputText
                type="text"
                [ngModel]="form().colorText"
                (ngModelChange)="patchForm('colorText', $event)"
                aria-label="Text color hex"
              />
            </div>
            <div class="branding__color-row">
              <label for="colorTextMuted">Text Muted</label>
              <input
                id="colorTextMuted"
                type="color"
                [(ngModel)]="form().colorTextMuted"
                (ngModelChange)="patchForm('colorTextMuted', $event)"
                aria-label="Text muted color"
              />
              <input
                pInputText
                type="text"
                [ngModel]="form().colorTextMuted"
                (ngModelChange)="patchForm('colorTextMuted', $event)"
                aria-label="Text muted color hex"
              />
            </div>
          </div>

          <!-- Actions -->
          <div class="branding__actions">
            <p-button label="Preview" severity="secondary" (onClick)="preview()" />
            <p-button
              label="Save"
              [loading]="saving()"
              (onClick)="save()"
            />
          </div>

          @if (saveError()) {
            <p class="branding__error">{{ saveError() }}</p>
          }
          @if (saveSuccess()) {
            <p class="branding__success">Branding saved successfully.</p>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      .branding {
        max-width: 48rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .branding__form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .branding__field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .branding__field label {
        font-weight: 500;
        font-size: 0.875rem;
      }
      .branding__colors h2 {
        font-size: 1rem;
        margin-bottom: 0.5rem;
      }
      .branding__color-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .branding__color-row label {
        width: 6rem;
        font-size: 0.875rem;
        font-weight: 500;
      }
      .branding__color-row input[type='color'] {
        width: 2.5rem;
        height: 2.5rem;
        border: 1px solid #d1d5db;
        border-radius: 0.25rem;
        padding: 0;
        cursor: pointer;
      }
      .branding__actions {
        display: flex;
        gap: 0.75rem;
        margin-top: 0.5rem;
      }
      .branding__error {
        color: #b00020;
      }
      .branding__success {
        color: #166534;
      }
    `,
  ],
})
export class BrandingComponent implements OnInit {
  private readonly tenantRepo = inject(TenantRepository);
  private readonly brandingService = inject(BrandingService);
  private readonly themeService = inject(ThemeService);
  private readonly tenantService = inject(TenantService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly saveSuccess = signal(false);

  protected readonly form = signal<BrandingForm>({
    logoUrl: '',
    faviconUrl: '',
    fontFamily: '',
    emailFromName: '',
    colorPrimary: '#1d4ed8',
    colorSurface: '#ffffff',
    colorAccent: '#7c3aed',
    colorText: '#111827',
    colorTextMuted: '#6b7280',
  });

  ngOnInit(): void {
    void this.loadBranding();
  }

  protected patchForm(field: keyof BrandingForm, value: string): void {
    this.form.set({ ...this.form(), [field]: value });
  }

  private async loadBranding(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) {
      this.loading.set(false);
      return;
    }
    try {
      const t = await this.tenantRepo.getById(tid);
      if (t?.branding) {
        const b = t.branding;
        this.form.set({
          logoUrl: b.logoUrl ?? '',
          faviconUrl: b.faviconUrl ?? '',
          fontFamily: b.fontFamily ?? '',
          emailFromName: b.emailFromName ?? '',
          colorPrimary: b.colors['--forge-color-primary'] ?? '#1d4ed8',
          colorSurface: b.colors['--forge-color-surface'] ?? '#ffffff',
          colorAccent: b.colors['--forge-color-accent'] ?? '#7c3aed',
          colorText: b.colors['--forge-color-text'] ?? '#111827',
          colorTextMuted: b.colors['--forge-color-text-muted'] ?? '#6b7280',
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected preview(): void {
    this.themeService.applyBranding(formToBranding(this.form()));
  }

  protected async save(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.saveSuccess.set(false);
    try {
      await this.brandingService.updateBranding(tid, formToBranding(this.form()));
      this.saveSuccess.set(true);
    } catch (err) {
      this.saveError.set((err as Error).message ?? 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
