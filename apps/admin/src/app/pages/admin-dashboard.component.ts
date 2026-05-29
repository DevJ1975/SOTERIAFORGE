import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CardModule } from 'primeng/card';

interface AdminSection {
  title: string;
  description: string;
}

@Component({
  selector: 'forge-admin-dashboard',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="admin-dash">
      <h1>Admin Console</h1>
      <div class="admin-dash__grid">
        @for (section of sections(); track section.title) {
          <p-card [header]="section.title">
            <p>{{ section.description }}</p>
          </p-card>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .admin-dash {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .admin-dash__grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
        gap: 1.25rem;
        margin-top: 1.5rem;
      }
    `,
  ],
})
export class AdminDashboardComponent {
  protected readonly sections = signal<AdminSection[]>([
    { title: 'Members', description: 'Manage tenant members, roles, and invitations (Phase 1+).' },
    { title: 'Courses', description: 'Create and assign courses to learners (Phase 1+).' },
    { title: 'Branding', description: 'Customize tenant colours, logos, and domain (Phase 1+).' },
    { title: 'Leaderboards', description: 'View XP rankings and engagement metrics (Phase 1+).' },
    { title: 'AI Knowledge Base', description: 'Upload documents for AI-powered Q&A (Phase 1+).' },
    {
      title: 'Reports',
      description: 'Export completion, compliance, and usage reports (Phase 1+).',
    },
  ]);
}
