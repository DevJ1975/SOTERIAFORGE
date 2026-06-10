import type { CourseDraft } from '@forge/shared';
import { AUTHORING_STORAGE_KEY, LocalStorageCourseRepository } from './course-repository';

const makeCourse = (overrides: Partial<CourseDraft> = {}): CourseDraft => ({
  id: 'course-1',
  title: 'Forklift Safety Fundamentals',
  description: 'Operate powered industrial trucks safely.',
  status: 'draft',
  lessons: [
    {
      id: 'lesson-1',
      title: 'Pre-Operation Inspection',
      blocks: [{ id: 'b1', kind: 'heading', text: 'Walkaround', level: 2 }],
    },
  ],
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-01T08:00:00Z',
  ...overrides,
});

describe('LocalStorageCourseRepository', () => {
  let repo: LocalStorageCourseRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageCourseRepository();
  });

  it('returns an empty list when nothing is stored', async () => {
    await expect(repo.list()).resolves.toEqual([]);
  });

  it('saves and reads back a course', async () => {
    const course = makeCourse();
    await repo.save(course);
    await expect(repo.get('course-1')).resolves.toEqual(course);
    expect(localStorage.getItem(AUTHORING_STORAGE_KEY)).toContain('Forklift Safety Fundamentals');
  });

  it('updates in place when saving the same id twice', async () => {
    await repo.save(makeCourse());
    await repo.save(makeCourse({ title: 'Forklift Safety — Revised' }));
    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Forklift Safety — Revised');
  });

  it('lists most recently updated first', async () => {
    await repo.save(makeCourse({ id: 'older', updatedAt: '2026-06-01T08:00:00Z' }));
    await repo.save(makeCourse({ id: 'newer', updatedAt: '2026-06-09T08:00:00Z' }));
    const all = await repo.list();
    expect(all.map((c) => c.id)).toEqual(['newer', 'older']);
  });

  it('deletes by id', async () => {
    await repo.save(makeCourse());
    await repo.delete('course-1');
    await expect(repo.list()).resolves.toEqual([]);
    await expect(repo.get('course-1')).resolves.toBeUndefined();
  });

  it('duplicates a course as a fresh draft with a new id', async () => {
    await repo.save(makeCourse({ status: 'published' }));
    const copy = await repo.duplicate('course-1');

    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe('course-1');
    expect(copy?.title).toBe('Forklift Safety Fundamentals (Copy)');
    expect(copy?.status).toBe('draft');
    expect(copy?.lessons).toEqual(makeCourse().lessons);
    await expect(repo.list()).resolves.toHaveLength(2);
  });

  it('resolves undefined when duplicating a missing course', async () => {
    await expect(repo.duplicate('nope')).resolves.toBeUndefined();
  });

  it('skips corrupt entries but keeps valid ones', async () => {
    const valid = makeCourse();
    const corrupt = { id: 'bad', title: 42, lessons: 'nope' };
    localStorage.setItem(AUTHORING_STORAGE_KEY, JSON.stringify([corrupt, valid]));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('course-1');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('recovers from a store that is not valid JSON', async () => {
    localStorage.setItem(AUTHORING_STORAGE_KEY, '{not json');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(repo.list()).resolves.toEqual([]);
    warn.mockRestore();
  });

  it('recovers from a store that is not an array', async () => {
    localStorage.setItem(AUTHORING_STORAGE_KEY, '{"id":"x"}');
    await expect(repo.list()).resolves.toEqual([]);
  });

  it('rejects saving an invalid course', async () => {
    const invalid = { ...makeCourse(), status: 'in_review' } as unknown as CourseDraft;
    await expect(repo.save(invalid)).rejects.toBeDefined();
  });

  it('falls back to in-memory storage when localStorage is unavailable', async () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    const isolated = new LocalStorageCourseRepository();
    await isolated.save(makeCourse());
    const all = await isolated.list();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('course-1');

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
