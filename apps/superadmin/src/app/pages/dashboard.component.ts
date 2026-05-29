import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardModule } from 'primeng/card';

interface PlatformSection {
  title: string;
  description: string;
  link?: string;
}

@Component({
  selector: 'forge-superadmin-dashboard',
  standalone: true,
  imports: [CardModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="superadmin-dash">
      <h1>Platform Administration</h1>
      <div class="superadmin-dash__grid">
        @for (section of sections; track section.title) {
          @if (section.link) {
            <a [routerLink]="section.link" class="superadmin-dash__link">
              <p-card [header]="section.title">
                <p>{{ section.description }}</p>
              </p-card>
            </a>
          } @else {
            <p-card [header]="section.title">
              <p>{{ section.description }}</p>
            </p-card>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      .superadmin-dash {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .superadmin-dash__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 1.25rem;
        margin-top: 1.5rem;
      }
      .superadmin-dash__link {
        text-decoration: none;
        color: inherit;
        display: block;
      }
      .superadmin-dash__link:hover p-card {
        opacity: 0.85;
      }
    `,
  ],
})
export class SuperadminDashboardComponent {
  protected readonly sections: PlatformSection[] = [
    {
      title: 'Tenants',
      description: 'Manage tenant organisations, provisioning, and configuration. (Phase 1+)',
      link: '/tenants',
    },
    {
      title: 'Global Course Library',
      description: 'Curate and publish courses available across all tenants. (Phase 1+)',
    },
    {
      title: 'Cross-tenant Analytics',
      description: 'Platform-wide usage metrics, completion rates, and learner trends. (Phase 1+)',
    },
    {
      title: 'Feature Flags',
      description: 'Toggle features per tenant or globally for staged rollouts. (Phase 1+)',
    },
    {
      title: 'Billing',
      description: 'Subscription plans, invoices, and seat usage across tenants. (Phase 1+)',
    },
    {
      title: 'B2C Catalog',
      description: 'Public-facing course marketplace and consumer enrolment flows. (Phase 1+)',
    },
  ];
}
