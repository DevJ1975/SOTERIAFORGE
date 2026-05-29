import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { QuizRepository } from '@forge/data-access';
import { TenantService } from '@forge/auth';
import type { Quiz } from '@forge/shared';

@Component({
  selector: 'forge-admin-quizzes',
  standalone: true,
  imports: [RouterLink, FormsModule, ButtonModule, InputTextModule, InputNumberModule, TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="quizzes">
      <h1>Quizzes</h1>

      <!-- New Quiz Form -->
      <div class="quizzes__new-form">
        <h2>New Quiz</h2>
        <div class="quizzes__form-row">
          <input
            pInputText
            type="text"
            placeholder="Quiz title"
            [(ngModel)]="newTitle"
            aria-label="Quiz title"
          />
          <p-inputNumber
            [(ngModel)]="newPassThreshold"
            [min]="0"
            [max]="100"
            placeholder="Pass threshold %"
            aria-label="Pass threshold percent"
          />
          <p-button
            label="Create Quiz"
            [loading]="creating()"
            [disabled]="!newTitle.trim()"
            (onClick)="createQuiz()"
          />
        </div>
        @if (createError()) {
          <p class="quizzes__error">{{ createError() }}</p>
        }
      </div>

      <!-- Quizzes Table -->
      @if (loading()) {
        <p>Loading quizzes…</p>
      } @else if (loadError()) {
        <p class="quizzes__error">{{ loadError() }}</p>
      } @else {
        <p-table
          [value]="quizzes()"
          [paginator]="quizzes().length > 10"
          [rows]="10"
          styleClass="p-datatable-sm"
        >
          <ng-template pTemplate="header">
            <tr>
              <th>Title</th>
              <th>Questions</th>
              <th>Pass %</th>
              <th>Actions</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-q>
            <tr>
              <td>
                <a [routerLink]="['/quizzes', q.id]">{{ q.title }}</a>
              </td>
              <td>{{ q.questions.length }}</td>
              <td>{{ q.passThreshold }}</td>
              <td class="quizzes__actions">
                <p-button
                  label="Edit"
                  severity="secondary"
                  size="small"
                  [routerLink]="['/quizzes', q.id]"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4">No quizzes found. Create your first quiz above.</td>
            </tr>
          </ng-template>
        </p-table>
      }
    </section>
  `,
  styles: [
    `
      .quizzes {
        max-width: 72rem;
        margin: 2rem auto;
        padding: 0 1rem;
      }
      .quizzes__new-form {
        background: var(--forge-color-surface, #fff);
        border: 1px solid #e5e7eb;
        border-radius: 0.5rem;
        padding: 1.25rem;
        margin-bottom: 2rem;
      }
      .quizzes__form-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }
      .quizzes__error {
        color: #b00020;
        margin-top: 0.5rem;
      }
      .quizzes__actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
    `,
  ],
})
export class QuizzesComponent implements OnInit {
  private readonly quizRepo = inject(QuizRepository);
  private readonly tenantService = inject(TenantService);

  protected readonly quizzes = signal<Quiz[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly createError = signal<string | null>(null);

  protected newTitle = '';
  protected newPassThreshold = 70;

  ngOnInit(): void {
    void this.loadQuizzes();
  }

  private async loadQuizzes(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid) return;
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.quizRepo.list(tid);
      this.quizzes.set(list);
    } catch (err) {
      this.loadError.set((err as Error).message ?? 'Failed to load quizzes');
    } finally {
      this.loading.set(false);
    }
  }

  protected async createQuiz(): Promise<void> {
    const tid = this.tenantService.tenantId();
    if (!tid || !this.newTitle.trim()) return;
    this.creating.set(true);
    this.createError.set(null);
    try {
      const now = new Date().toISOString();
      const newQuiz: Quiz = {
        id: crypto.randomUUID(),
        tenantId: tid,
        title: this.newTitle.trim(),
        questions: [],
        passThreshold: this.newPassThreshold ?? 70,
        randomize: false,
        scoring: 'percent',
        createdAt: now,
      };
      await this.quizRepo.set(tid, newQuiz);
      this.newTitle = '';
      this.newPassThreshold = 70;
      await this.loadQuizzes();
    } catch (err) {
      this.createError.set((err as Error).message ?? 'Failed to create quiz');
    } finally {
      this.creating.set(false);
    }
  }
}
