import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import type { CourseDraft } from '@forge/shared';
import { COURSE_REPOSITORY, createId } from '@forge/lms-core';
import { buildSeedCourse } from './seed-course';

const SEED_FLAG_KEY = 'forge.authoring.seeded.v1';

/**
 * Forge Studio home: every course as a card with status, lesson/block
 * counts, and quick actions. Seeds the demo course on first run.
 */
@Component({
  selector: 'app-course-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
  imports: [DatePipe, ButtonModule, ConfirmDialogModule, TooltipModule],
  templateUrl: './course-list-page.html',
  styleUrl: './course-list-page.scss',
})
export class CourseListPage implements OnInit {
  private readonly repository = inject(COURSE_REPOSITORY);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);

  protected readonly courses = signal<CourseDraft[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    await this.seedOnFirstRun();
    this.courses.set(await this.repository.list());
    this.loading.set(false);
  }

  private async seedOnFirstRun(): Promise<void> {
    let alreadySeeded = false;
    try {
      alreadySeeded = localStorage.getItem(SEED_FLAG_KEY) === '1';
    } catch {
      alreadySeeded = true; // no storage — don't bother seeding
    }
    if (alreadySeeded) return;
    const existing = await this.repository.list();
    if (existing.length === 0) {
      await this.repository.save(buildSeedCourse());
    }
    try {
      localStorage.setItem(SEED_FLAG_KEY, '1');
    } catch {
      // storage unavailable: seeding will simply be attempted again next run
    }
  }

  protected blockCount(course: CourseDraft): number {
    return course.lessons.reduce((sum, lesson) => sum + lesson.blocks.length, 0);
  }

  protected excerpt(text: string): string {
    if (text.length <= 140) return text;
    return `${text.slice(0, 140).trimEnd()}…`;
  }

  protected open(course: CourseDraft): void {
    void this.router.navigate(['/courses', course.id]);
  }

  protected async createCourse(): Promise<void> {
    const now = new Date().toISOString();
    const course: CourseDraft = {
      id: createId('course'),
      title: 'Untitled course',
      description: '',
      status: 'draft',
      lessons: [{ id: createId('lesson'), title: 'Lesson 1', blocks: [] }],
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(course);
    void this.router.navigate(['/courses', course.id]);
  }

  protected async duplicate(course: CourseDraft, event: Event): Promise<void> {
    event.stopPropagation();
    await this.repository.duplicate(course.id);
    this.courses.set(await this.repository.list());
  }

  protected confirmDelete(course: CourseDraft, event: Event): void {
    event.stopPropagation();
    this.confirmation.confirm({
      header: 'Delete course',
      message: `Delete “${course.title}” and all of its lessons? This cannot be undone.`,
      icon: 'pi pi-trash',
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', text: true },
      accept: () => {
        void (async () => {
          await this.repository.delete(course.id);
          this.courses.set(await this.repository.list());
        })();
      },
    });
  }
}
