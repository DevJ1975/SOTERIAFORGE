import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import type { Block, BlockKind, CourseDraft, LessonDraft, PublishStatus } from '@forge/shared';
import { COURSE_REPOSITORY, createId, deepClone, EditHistory } from '@forge/lms-core';
import { createBlock } from './block-defs';

export type SaveState = 'idle' | 'saving' | 'saved';

/** Debounce window for autosave after the last edit. */
export const AUTOSAVE_DELAY_MS = 800;

/**
 * Forge Studio builder state. Holds the CourseDraft being edited in a signal;
 * every mutation flows through `commit(label, mutator)`, which snapshots the
 * previous state into the undo history and debounce-autosaves through the
 * CourseRepository. Provided at the builder page so each course gets a fresh
 * store.
 */
@Injectable()
export class BuilderStore implements OnDestroy {
  private readonly repository = inject(COURSE_REPOSITORY);
  private readonly history = new EditHistory<CourseDraft>(100);
  private undoLabels: string[] = [];
  private redoLabels: string[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePending = false;

  readonly course = signal<CourseDraft | null>(null);
  readonly activeLessonId = signal<string | null>(null);
  readonly selectedBlockId = signal<string | null>(null);
  readonly saveState = signal<SaveState>('idle');
  readonly lastSavedAt = signal<Date | null>(null);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly undoLabel = signal<string | null>(null);
  readonly redoLabel = signal<string | null>(null);

  readonly activeLesson = computed<LessonDraft | null>(() => {
    const course = this.course();
    if (!course) return null;
    const id = this.activeLessonId();
    return course.lessons.find((lesson) => lesson.id === id) ?? course.lessons[0] ?? null;
  });

  readonly selectedBlock = computed<Block | null>(() => {
    const id = this.selectedBlockId();
    if (!id) return null;
    return this.activeLesson()?.blocks.find((block) => block.id === id) ?? null;
  });

  // ---- Lifecycle -------------------------------------------------------------

  async load(courseId: string): Promise<boolean> {
    const course = await this.repository.get(courseId);
    if (!course) return false;
    this.history.clear();
    this.undoLabels = [];
    this.redoLabels = [];
    this.course.set(course);
    this.activeLessonId.set(course.lessons[0]?.id ?? null);
    this.selectedBlockId.set(null);
    this.saveState.set('idle');
    this.syncHistoryFlags();
    return true;
  }

  ngOnDestroy(): void {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    // Flush any pending edit so closing the page never loses work.
    if (this.savePending) {
      void this.persist();
    }
  }

  // ---- The single mutation gateway ---------------------------------------------

  /**
   * Apply `mutator` to a deep clone of the current draft, record the previous
   * state for undo, and schedule a debounced autosave.
   */
  commit(label: string, mutator: (draft: CourseDraft) => void): void {
    const current = this.course();
    if (!current) return;
    this.history.push(current);
    this.undoLabels.push(label);
    if (this.undoLabels.length > 100) this.undoLabels.shift();
    this.redoLabels = [];

    const next = deepClone(current);
    mutator(next);
    next.updatedAt = new Date().toISOString();
    this.course.set(next);
    this.reconcileSelection();
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  undo(): void {
    const current = this.course();
    if (!current) return;
    const snapshot = this.history.undo(current);
    if (!snapshot) return;
    const label = this.undoLabels.pop();
    if (label) this.redoLabels.push(label);
    this.course.set(snapshot);
    this.reconcileSelection();
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  redo(): void {
    const current = this.course();
    if (!current) return;
    const snapshot = this.history.redo(current);
    if (!snapshot) return;
    const label = this.redoLabels.pop();
    if (label) this.undoLabels.push(label);
    this.course.set(snapshot);
    this.reconcileSelection();
    this.syncHistoryFlags();
    this.scheduleSave();
  }

  // ---- Saving --------------------------------------------------------------------

  private scheduleSave(): void {
    this.savePending = true;
    this.saveState.set('saving');
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist();
    }, AUTOSAVE_DELAY_MS);
  }

  /** Ctrl/Cmd+S: skip the debounce and write immediately. */
  async saveNow(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveState.set('saving');
    await this.persist();
  }

  private async persist(): Promise<void> {
    const course = this.course();
    if (!course) return;
    this.savePending = false;
    try {
      await this.repository.save(course);
      this.saveState.set('saved');
      this.lastSavedAt.set(new Date());
    } catch (error) {
      console.error('[forge] autosave failed', error);
      this.saveState.set('idle');
    }
  }

  // ---- Course & lesson operations ----------------------------------------------------

  renameCourse(title: string): void {
    const trimmed = title.trim();
    if (!trimmed || trimmed === this.course()?.title) return;
    this.commit('Rename course', (draft) => {
      draft.title = trimmed;
    });
  }

  setDescription(description: string): void {
    if (description === this.course()?.description) return;
    this.commit('Edit description', (draft) => {
      draft.description = description;
    });
  }

  setStatus(status: PublishStatus): void {
    this.commit(status === 'published' ? 'Publish course' : 'Unpublish course', (draft) => {
      draft.status = status;
    });
    void this.saveNow();
  }

  addLesson(): void {
    const lesson: LessonDraft = {
      id: createId('lesson'),
      title: `Lesson ${(this.course()?.lessons.length ?? 0) + 1}`,
      blocks: [],
    };
    this.commit('Add lesson', (draft) => {
      draft.lessons.push(lesson);
    });
    this.activeLessonId.set(lesson.id);
    this.selectedBlockId.set(null);
  }

  renameLesson(lessonId: string, title: string): void {
    const trimmed = title.trim();
    if (!trimmed) return;
    const existing = this.course()?.lessons.find((lesson) => lesson.id === lessonId);
    if (!existing || existing.title === trimmed) return;
    this.commit('Rename lesson', (draft) => {
      const lesson = draft.lessons.find((l) => l.id === lessonId);
      if (lesson) lesson.title = trimmed;
    });
  }

  deleteLesson(lessonId: string): void {
    this.commit('Delete lesson', (draft) => {
      draft.lessons = draft.lessons.filter((lesson) => lesson.id !== lessonId);
    });
    if (this.activeLessonId() === lessonId) {
      this.activeLessonId.set(this.course()?.lessons[0]?.id ?? null);
      this.selectedBlockId.set(null);
    }
  }

  moveLesson(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    this.commit('Reorder lessons', (draft) => {
      const [moved] = draft.lessons.splice(fromIndex, 1);
      if (moved) draft.lessons.splice(toIndex, 0, moved);
    });
  }

  selectLesson(lessonId: string): void {
    this.activeLessonId.set(lessonId);
    this.selectedBlockId.set(null);
  }

  // ---- Block operations -----------------------------------------------------------------

  /** Insert a new block of `kind` at `index` in the active lesson; selects it. */
  insertBlock(kind: BlockKind, index: number): Block {
    const block = createBlock(kind);
    const lessonId = this.activeLesson()?.id;
    this.commit('Add block', (draft) => {
      const lesson = draft.lessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      const at = Math.max(0, Math.min(index, lesson.blocks.length));
      lesson.blocks.splice(at, 0, block);
    });
    this.selectedBlockId.set(block.id);
    return block;
  }

  /**
   * Shallow-merge `patch` onto the block with `id`. Skips the commit (and the
   * history entry) when every patched field already holds the same value.
   */
  patchBlock(id: string, patch: Record<string, unknown>, label = 'Edit block'): void {
    const target = this.activeLesson()?.blocks.find((block) => block.id === id);
    if (target) {
      const record = target as unknown as Record<string, unknown>;
      const dirty = Object.entries(patch).some(
        ([key, value]) => JSON.stringify(record[key]) !== JSON.stringify(value),
      );
      if (!dirty) return;
    }
    const lessonId = this.activeLesson()?.id;
    this.commit(label, (draft) => {
      const lesson = draft.lessons.find((l) => l.id === lessonId);
      const block = lesson?.blocks.find((b) => b.id === id);
      if (block) Object.assign(block, patch);
    });
  }

  duplicateBlock(id: string): void {
    const lessonId = this.activeLesson()?.id;
    let copyId: string | null = null;
    this.commit('Duplicate block', (draft) => {
      const lesson = draft.lessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      const index = lesson.blocks.findIndex((b) => b.id === id);
      if (index < 0) return;
      const copy = deepClone(lesson.blocks[index]);
      copy.id = createId('block');
      copyId = copy.id;
      lesson.blocks.splice(index + 1, 0, copy);
    });
    if (copyId) this.selectedBlockId.set(copyId);
  }

  deleteBlock(id: string): void {
    const lessonId = this.activeLesson()?.id;
    this.commit('Delete block', (draft) => {
      const lesson = draft.lessons.find((l) => l.id === lessonId);
      if (lesson) lesson.blocks = lesson.blocks.filter((b) => b.id !== id);
    });
    if (this.selectedBlockId() === id) this.selectedBlockId.set(null);
  }

  moveBlock(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const lessonId = this.activeLesson()?.id;
    this.commit('Reorder blocks', (draft) => {
      const lesson = draft.lessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      const [moved] = lesson.blocks.splice(fromIndex, 1);
      if (moved) lesson.blocks.splice(toIndex, 0, moved);
    });
  }

  /** Nudge a block up (-1) or down (+1) within the active lesson. */
  moveBlockBy(id: string, delta: -1 | 1): void {
    const blocks = this.activeLesson()?.blocks ?? [];
    const index = blocks.findIndex((b) => b.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    this.moveBlock(index, target);
  }

  selectBlock(id: string | null): void {
    this.selectedBlockId.set(id);
  }

  // ---- Internals -----------------------------------------------------------------------------

  /** Drop selections that no longer resolve after a mutation/undo/redo. */
  private reconcileSelection(): void {
    const course = this.course();
    if (!course) return;
    const lessonId = this.activeLessonId();
    if (!lessonId || !course.lessons.some((lesson) => lesson.id === lessonId)) {
      this.activeLessonId.set(course.lessons[0]?.id ?? null);
    }
    const blockId = this.selectedBlockId();
    if (blockId && !this.activeLesson()?.blocks.some((block) => block.id === blockId)) {
      this.selectedBlockId.set(null);
    }
  }

  private syncHistoryFlags(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
    this.undoLabel.set(this.undoLabels[this.undoLabels.length - 1] ?? null);
    this.redoLabel.set(this.redoLabels[this.redoLabels.length - 1] ?? null);
  }
}
