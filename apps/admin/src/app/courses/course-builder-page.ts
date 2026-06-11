import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import type { LessonDraft } from '@forge/shared';
import { ForgeLessonRenderer } from '@forge/lms-core';
import type { BlockKind } from '@forge/shared';
import { BuilderStore } from './builder-store';
import { BlockCard } from './block-card';
import { BlockPalette } from './block-palette';
import { BlockInspector } from './block-inspector';

type DeviceSize = 'desktop' | 'tablet' | 'mobile';

/**
 * Forge Studio builder: outline rail / editing canvas / inspector, with a
 * top bar carrying autosave status, undo/redo, preview, and publishing.
 */
@Component({
  selector: 'app-course-builder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BuilderStore, ConfirmationService],
  imports: [
    DatePipe,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    ButtonModule,
    ConfirmDialogModule,
    TooltipModule,
    ForgeLessonRenderer,
    BlockCard,
    BlockPalette,
    BlockInspector,
  ],
  templateUrl: './course-builder-page.html',
  styleUrl: './course-builder-page.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class CourseBuilderPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmation = inject(ConfirmationService);
  protected readonly store = inject(BuilderStore);

  protected readonly notFound = signal(false);
  protected readonly loading = signal(true);
  protected readonly preview = signal(false);
  protected readonly device = signal<DeviceSize>('desktop');
  /** Index at which the insert palette is open, or null. */
  protected readonly paletteIndex = signal<number | null>(null);
  protected readonly editingLessonId = signal<string | null>(null);

  protected readonly devices: { id: DeviceSize; icon: string; label: string }[] = [
    { id: 'desktop', icon: 'pi pi-desktop', label: 'Desktop' },
    { id: 'tablet', icon: 'pi pi-tablet', label: 'Tablet · 768px' },
    { id: 'mobile', icon: 'pi pi-mobile', label: 'Mobile · 390px' },
  ];

  protected readonly deviceWidth = computed(() => {
    switch (this.device()) {
      case 'tablet':
        return '768px';
      case 'mobile':
        return '390px';
      default:
        return '100%';
    }
  });

  protected readonly lessonIndex = computed(() => {
    const course = this.store.course();
    const active = this.store.activeLesson();
    if (!course || !active) return -1;
    return course.lessons.findIndex((lesson) => lesson.id === active.id);
  });

  async ngOnInit(): Promise<void> {
    const courseId = this.route.snapshot.paramMap.get('courseId') ?? '';
    const loaded = await this.store.load(courseId);
    this.loading.set(false);
    if (!loaded) this.notFound.set(true);
  }

  // ---- Keyboard shortcuts ------------------------------------------------------

  protected onKeydown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && key === 's') {
      event.preventDefault();
      void this.store.saveNow();
      return;
    }

    const editable = this.isEditableTarget(event.target);

    if (mod && key === 'z' && !event.shiftKey) {
      if (!editable) {
        event.preventDefault();
        this.store.undo();
      }
      return;
    }
    if ((mod && key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y')) {
      if (!editable) {
        event.preventDefault();
        this.store.redo();
      }
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !editable && !this.preview()) {
      const selected = this.store.selectedBlockId();
      if (selected) {
        event.preventDefault();
        this.store.deleteBlock(selected);
      }
    }
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT'
    );
  }

  // ---- Canvas ---------------------------------------------------------------------

  protected onCanvasClick(): void {
    this.store.selectBlock(null);
  }

  protected togglePalette(index: number, event: Event): void {
    event.stopPropagation();
    this.paletteIndex.set(this.paletteIndex() === index ? null : index);
  }

  protected closePalette(): void {
    this.paletteIndex.set(null);
  }

  protected insertAt(index: number, kind: BlockKind): void {
    this.store.insertBlock(kind, index);
    this.closePalette();
  }

  protected onBlockDrop(event: CdkDragDrop<unknown>): void {
    this.store.moveBlock(event.previousIndex, event.currentIndex);
  }

  // ---- Outline rail ------------------------------------------------------------------

  protected onLessonDrop(event: CdkDragDrop<unknown>): void {
    this.store.moveLesson(event.previousIndex, event.currentIndex);
  }

  protected singleLine(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    }
  }

  protected commitCourseTitle(event: Event): void {
    const text = ((event.target as HTMLElement).textContent ?? '').trim();
    if (text) {
      this.store.renameCourse(text);
    } else {
      // Restore the previous title rather than committing an empty one.
      (event.target as HTMLElement).textContent = this.store.course()?.title ?? '';
    }
  }

  protected startRename(lessonId: string, event: Event): void {
    event.stopPropagation();
    this.editingLessonId.set(lessonId);
    setTimeout(() => {
      const input = document.getElementById(`lesson-rename-${lessonId}`) as HTMLInputElement | null;
      input?.focus();
      input?.select();
    });
  }

  protected commitLessonRename(lessonId: string, event: Event): void {
    if (this.editingLessonId() !== lessonId) return;
    const value = (event.target as HTMLInputElement).value;
    this.editingLessonId.set(null);
    this.store.renameLesson(lessonId, value);
  }

  protected confirmDeleteLesson(lesson: LessonDraft, event: Event): void {
    event.stopPropagation();
    this.confirmation.confirm({
      header: 'Delete lesson',
      message: `Delete “${lesson.title}” and its ${lesson.blocks.length} block${
        lesson.blocks.length === 1 ? '' : 's'
      }? You can undo with Ctrl+Z.`,
      icon: 'pi pi-trash',
      acceptButtonProps: { label: 'Delete', severity: 'danger' },
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', text: true },
      accept: () => this.store.deleteLesson(lesson.id),
    });
  }

  // ---- Top bar -------------------------------------------------------------------------

  protected confirmPublish(): void {
    const course = this.store.course();
    if (!course) return;
    const publishing = course.status !== 'published';
    this.confirmation.confirm({
      header: publishing ? 'Publish course' : 'Unpublish course',
      message: publishing
        ? `Publish “${course.title}”? Learners will see the latest saved version.`
        : `Unpublish “${course.title}”? It returns to draft and disappears for learners.`,
      icon: publishing ? 'pi pi-cloud-upload' : 'pi pi-cloud-download',
      acceptButtonProps: { label: publishing ? 'Publish' : 'Unpublish' },
      rejectButtonProps: { label: 'Cancel', severity: 'secondary', text: true },
      accept: () => this.store.setStatus(publishing ? 'published' : 'draft'),
    });
  }

  protected togglePreview(): void {
    this.preview.update((value) => !value);
    this.closePalette();
  }

  // ---- Preview navigation ------------------------------------------------------------------

  protected gotoLesson(delta: -1 | 1): void {
    const course = this.store.course();
    if (!course) return;
    const target = course.lessons[this.lessonIndex() + delta];
    if (target) this.store.selectLesson(target.id);
  }

  protected backToList(): void {
    void this.router.navigate(['/courses']);
  }
}
