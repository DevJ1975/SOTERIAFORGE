import { Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ForgeShell, ShellLink } from '@forge/ui';
import { ForgeAuthButton, PrincipalStore } from '@forge/auth';

@Component({
  imports: [RouterModule, ForgeShell, ForgeAuthButton],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly appName = 'Soteria FORGE Store';
  protected readonly navLinks: ShellLink[] = [
    { label: 'Home', path: '/' },
    { label: 'Catalog', path: '/catalog' },
    { label: 'My Library', path: '/library' },
  ];

  constructor() {
    // Safe without Firebase providers (SSR bootstrap, TestBed): init()
    // settles to 'signedOut' when Auth is unavailable instead of throwing.
    inject(PrincipalStore).init();
  }
}
