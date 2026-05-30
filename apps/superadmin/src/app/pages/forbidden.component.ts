import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'assurance-superadmin-forbidden',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="forbidden">
      <h1>Access denied</h1>
      <p>You don't have permission to view this page in this tenant.</p>
      <a routerLink="/login">Switch account</a>
    </section>
  `,
  styles: [
    `
      .forbidden {
        max-width: 40rem;
        margin: 4rem auto;
        text-align: center;
      }
    `,
  ],
})
export class ForbiddenComponent {}
