import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { PwaInstallService } from './pwa-install.service';

/** "Install app" button — renders only when the browser offers an install prompt. */
@Component({
  selector: 'app-pwa-install',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pwa.canInstall()) {
      <p-button
        label="Install app"
        icon="pi pi-download"
        severity="secondary"
        [outlined]="true"
        (onClick)="pwa.install()"
        aria-label="Install Soteria FORGE as an app on this device"
      />
    }
  `,
})
export class PwaInstall {
  protected readonly pwa = inject(PwaInstallService);
}
