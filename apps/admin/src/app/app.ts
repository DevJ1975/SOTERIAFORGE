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
  protected readonly appName = 'FORGE Admin';
  protected readonly navLinks: ShellLink[] = [
    { label: 'Home', path: '/' },
    { label: 'Courses', path: '/courses' },
    { label: 'Live Sessions', path: '/live-sessions' },
  ];

  constructor() {
    // Safe without Firebase providers (e.g. TestBed): init() settles to
    // 'signedOut' when Auth is unavailable instead of throwing.
    inject(PrincipalStore).init();
  }
}
