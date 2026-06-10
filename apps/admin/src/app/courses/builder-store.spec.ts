import { TestBed } from '@angular/core/testing';
import type { CourseDraft } from '@forge/shared';
import { COURSE_REPOSITORY, CourseRepository } from '@forge/lms-core';
import { AUTOSAVE_DELAY_MS, BuilderStore } from './builder-store';

const makeCourse = (): CourseDraft => ({
  id: 'course-1',
  title: 'Forklift Safety Fundamentals',
  description: '',
  status: 'draft',
  lessons: [
    {
      id: 'lesson-1',
      title: 'Pre-Operation Inspection',
      blocks: [
        { id: 'b1', kind: 'heading', text: 'Walkaround', level: 2 },
        { id: 'b2', kind: 'paragraph', html: 'Check the forks.' },
      ],
    },
    { id: 'lesson-2', title: 'Load Handling', blocks: [] },
  ],
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-01T08:00:00Z',
});

describe('BuilderStore', () => {
  let store: BuilderStore;
  let repo: jest.Mocked<CourseRepository>;

  beforeEach(async () => {
    jest.useFakeTimers();
    repo = {
      list: jest.fn().mockResolvedValue([]),
      get: jest.fn().mockResolvedValue(makeCourse()),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      duplicate: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [BuilderStore, { provide: COURSE_REPOSITORY, useValue: repo }],
    });
    store = TestBed.inject(BuilderStore);
    await store.load('course-1');
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('loads the course and activates the first lesson', () => {
    expect(store.course()?.title).toBe('Forklift Safety Fundamentals');
    expect(store.activeLesson()?.id).toBe('lesson-1');
    expect(store.canUndo()).toBe(false);
  });

  it('reports failure for a missing course', async () => {
    repo.get.mockResolvedValueOnce(undefined);
    await expect(store.load('nope')).resolves.toBe(false);
  });

  describe('commit', () => {
    it('applies the mutation immutably and bumps updatedAt', () => {
      const before = store.course();
      store.commit('Rename course', (draft) => {
        draft.title = 'Renamed';
      });
      const after = store.course();
      expect(after?.title).toBe('Renamed');
      expect(before?.title).toBe('Forklift Safety Fundamentals'); // untouched snapshot
      expect(after?.updatedAt).not.toBe(before?.updatedAt);
    });

    it('pushes history and exposes the commit label', () => {
      store.commit('Add block', (draft) => {
        draft.lessons[0].blocks.push({ id: 'b3', kind: 'divider', style: 'line' });
      });
      expect(store.canUndo()).toBe(true);
      expect(store.undoLabel()).toBe('Add block');
    });

    it('debounce-autosaves once for a burst of commits', async () => {
      store.commit('Edit 1', (d) => void (d.title = 'One'));
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS / 2);
      store.commit('Edit 2', (d) => void (d.title = 'Two'));
      store.commit('Edit 3', (d) => void (d.title = 'Three'));
      expect(store.saveState()).toBe('saving');
      expect(repo.save).not.toHaveBeenCalled();

      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
      await Promise.resolve(); // let the async persist settle

      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Three' }));
      expect(store.saveState()).toBe('saved');
      expect(store.lastSavedAt()).not.toBeNull();
    });
  });

  describe('undo / redo', () => {
    it('restores snapshots in both directions and saves', async () => {
      store.commit('Rename course', (d) => void (d.title = 'Renamed'));
      store.undo();
      expect(store.course()?.title).toBe('Forklift Safety Fundamentals');
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(true);
      expect(store.redoLabel()).toBe('Rename course');

      store.redo();
      expect(store.course()?.title).toBe('Renamed');
      expect(store.canRedo()).toBe(false);

      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS);
      await Promise.resolve();
      expect(repo.save).toHaveBeenCalled();
    });

    it('clears a selection that no longer resolves after undo', () => {
      store.insertBlock('quote', 2);
      const inserted = store.selectedBlockId();
      expect(inserted).toBeTruthy();
      store.undo();
      expect(store.selectedBlockId()).toBeNull();
      expect(store.activeLesson()?.blocks).toHaveLength(2);
    });
  });

  describe('saveNow', () => {
    it('flushes the pending debounce immediately', async () => {
      store.commit('Edit', (d) => void (d.title = 'Now'));
      expect(repo.save).not.toHaveBeenCalled();
      await store.saveNow();
      expect(repo.save).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(AUTOSAVE_DELAY_MS * 2);
      expect(repo.save).toHaveBeenCalledTimes(1); // debounce timer was cancelled
    });
  });

  describe('block operations', () => {
    it('inserts at a position and selects the new block', () => {
      const block = store.insertBlock('callout', 1);
      const blocks = store.activeLesson()?.blocks ?? [];
      expect(blocks[1].id).toBe(block.id);
      expect(store.selectedBlockId()).toBe(block.id);
    });

    it('patchBlock skips no-op patches (no history entry)', () => {
      store.patchBlock('b1', { text: 'Walkaround' });
      expect(store.canUndo()).toBe(false);
      store.patchBlock('b1', { text: 'Changed' });
      expect(store.canUndo()).toBe(true);
    });

    it('duplicates a block right below the original with a fresh id', () => {
      store.duplicateBlock('b1');
      const blocks = store.activeLesson()?.blocks ?? [];
      expect(blocks).toHaveLength(3);
      expect(blocks[1].kind).toBe('heading');
      expect(blocks[1].id).not.toBe('b1');
    });

    it('deletes and reorders blocks', () => {
      store.moveBlockBy('b2', -1);
      expect(store.activeLesson()?.blocks.map((b) => b.id)).toEqual(['b2', 'b1']);
      store.deleteBlock('b2');
      expect(store.activeLesson()?.blocks.map((b) => b.id)).toEqual(['b1']);
    });
  });

  describe('lesson operations', () => {
    it('adds, renames, reorders, and deletes lessons', () => {
      store.addLesson();
      expect(store.course()?.lessons).toHaveLength(3);
      expect(store.activeLesson()?.title).toBe('Lesson 3');

      store.renameLesson(store.activeLesson()?.id ?? '', 'Refueling & Charging');
      expect(store.activeLesson()?.title).toBe('Refueling & Charging');

      store.moveLesson(2, 0);
      expect(store.course()?.lessons[0].title).toBe('Refueling & Charging');

      const id = store.course()?.lessons[0].id ?? '';
      store.deleteLesson(id);
      expect(store.course()?.lessons).toHaveLength(2);
    });
  });

  it('setStatus publishes with an immediate save', async () => {
    store.setStatus('published');
    expect(store.course()?.status).toBe('published');
    await Promise.resolve();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
  });
});
