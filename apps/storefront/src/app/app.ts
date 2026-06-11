import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ForgeShell, ShellLink } from '@forge/ui';

@Component({
  imports: [RouterModule, ForgeShell],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly appName = 'Soteria FORGE Store';
  protected readonly navLinks: ShellLink[] = [{ label: 'Home', path: '/' }];
}
