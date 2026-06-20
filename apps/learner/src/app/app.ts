import { Component, effect, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { getDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { ForgeShell, ShellLink } from '@forge/ui';
import { ForgeAuthButton, ForgeTheming, PrincipalStore } from '@forge/auth';
import { FIRESTORE, tenantDoc } from '@forge/data-access';

@Component({
  imports: [RouterModule, ForgeShell, ForgeAuthButton],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly appName = 'Soteria FORGE';
  protected readonly navLinks: ShellLink[] = [
    { label: 'Home', path: '/' },
    { label: 'Courses', path: '/courses' },
    { label: 'My Learning', path: '/my-learning' },
    { label: 'Live sessions', path: '/live-sessions' },
    { label: 'Downloads', path: '/downloads' },
    { label: 'Hazard Hunter', path: '/games/hazard-hunter' },
    { label: 'PERIL!', path: '/games/peril' },
  ];

  private readonly principal = inject(PrincipalStore);
  private readonly theming = inject(ForgeTheming);
  // Optional: TestBed / SSR shells run without Firebase providers.
  private readonly db = inject(FIRESTORE, { optional: true });
  private appliedTenantId: string | null = null;

  constructor() {
    // Safe without Firebase providers (e.g. TestBed): init() settles to
    // 'signedOut' when Auth is unavailable instead of throwing.
    this.principal.init();

    // Apply per-tenant branding once the principal's tenant doc is available.
    effect(() => {
      const tenantId = this.principal.tenantId();
      const db = this.db;
      if (!tenantId || !db || tenantId === this.appliedTenantId) return;
      this.appliedTenantId = tenantId;
      void this.applyTenantBranding(db, tenantId);
    });
  }

  private async applyTenantBranding(db: Firestore, tenantId: string): Promise<void> {
    try {
      const snapshot = await getDoc(tenantDoc(db, tenantId));
      if (snapshot.exists()) {
        this.theming.applyBranding(snapshot.data().branding);
      }
    } catch {
      // Branding is best-effort; the stock Forge theme is a safe fallback.
    }
  }
}
