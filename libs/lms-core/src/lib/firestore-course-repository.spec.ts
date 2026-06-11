import type { CourseDraft } from '@forge/shared';
import type { Firestore } from 'firebase/firestore';
import type { CourseRepository } from './course-repository';
import {
  DelegatingCourseRepository,
  FirestoreCourseRepository,
} from './firestore-course-repository';

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

/**
 * FirestoreCourseRepository with the Firestore seams replaced by an in-memory
 * map, so id-generation / duplicate semantics are testable without a real db.
 */
class StubbedFirestoreCourseRepository extends FirestoreCourseRepository {
  readonly docs = new Map<string, CourseDraft>();

  protected override async fetchAll(): Promise<CourseDraft[]> {
    return [...this.docs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  protected override async fetchOne(
    _tenantId: string,
    id: string,
  ): Promise<CourseDraft | undefined> {
    return this.docs.get(id);
  }

  protected override async writeOne(_tenantId: string, course: CourseDraft): Promise<void> {
    this.docs.set(course.id, course);
  }

  protected override async deleteOne(_tenantId: string, id: string): Promise<void> {
    this.docs.delete(id);
  }
}

const FAKE_DB = {} as Firestore;

describe('FirestoreCourseRepository', () => {
  describe('without a tenant context', () => {
    const repo = new StubbedFirestoreCourseRepository({ db: FAKE_DB, tenantId: () => null });

    it.each([
      ['list', () => repo.list()],
      ['get', () => repo.get('course-1')],
      ['save', () => repo.save(makeCourse())],
      ['delete', () => repo.delete('course-1')],
      ['duplicate', () => repo.duplicate('course-1')],
    ])('rejects %s with a clear sign-in error', async (_name, call) => {
      await expect(call()).rejects.toThrow('No tenant context — sign in first');
    });
  });

  describe('with a tenant context', () => {
    let repo: StubbedFirestoreCourseRepository;

    beforeEach(() => {
      repo = new StubbedFirestoreCourseRepository({ db: FAKE_DB, tenantId: () => 'acme' });
    });

    it('re-reads the tenant on every call (getter, not snapshot)', async () => {
      let tenant: string | null = null;
      const lateSignIn = new StubbedFirestoreCourseRepository({
        db: FAKE_DB,
        tenantId: () => tenant,
      });
      await expect(lateSignIn.list()).rejects.toThrow('No tenant context — sign in first');
      tenant = 'acme';
      await expect(lateSignIn.list()).resolves.toEqual([]);
    });

    it('saves and reads back a course', async () => {
      const course = makeCourse();
      await repo.save(course);
      await expect(repo.get('course-1')).resolves.toEqual(course);
    });

    it('rejects saving an invalid course', async () => {
      const invalid = { ...makeCourse(), status: 'in_review' } as unknown as CourseDraft;
      await expect(repo.save(invalid)).rejects.toBeDefined();
      expect(repo.docs.size).toBe(0);
    });

    it('deletes by id', async () => {
      await repo.save(makeCourse());
      await repo.delete('course-1');
      await expect(repo.get('course-1')).resolves.toBeUndefined();
    });

    it('duplicates a course as a fresh draft with a new id and fresh timestamps', async () => {
      await repo.save(makeCourse({ status: 'published' }));
      const before = new Date().toISOString();
      const copy = await repo.duplicate('course-1');

      expect(copy).toBeDefined();
      expect(copy?.id).not.toBe('course-1');
      expect(copy?.id).toMatch(/^course-/);
      expect(copy?.title).toBe('Forklift Safety Fundamentals (Copy)');
      expect(copy?.status).toBe('draft');
      expect(copy?.lessons).toEqual(makeCourse().lessons);
      expect(copy?.createdAt).toBe(copy?.updatedAt);
      expect(copy && copy.createdAt >= before).toBe(true);
      // The copy is persisted, and the source is untouched.
      expect(repo.docs.size).toBe(2);
      await expect(repo.get('course-1')).resolves.toEqual(makeCourse({ status: 'published' }));
    });

    it('deep-copies lessons so the duplicate does not alias the source', async () => {
      await repo.save(makeCourse());
      const copy = await repo.duplicate('course-1');
      copy?.lessons[0].blocks.push({ id: 'b2', kind: 'divider', style: 'line' });
      const source = await repo.get('course-1');
      expect(source?.lessons[0].blocks).toHaveLength(1);
    });

    it('resolves undefined when duplicating a missing course', async () => {
      await expect(repo.duplicate('nope')).resolves.toBeUndefined();
      expect(repo.docs.size).toBe(0);
    });
  });
});

describe('DelegatingCourseRepository', () => {
  const stubRepo = (label: string): jest.Mocked<CourseRepository> => ({
    list: jest.fn().mockResolvedValue([makeCourse({ id: `${label}-list` })]),
    get: jest.fn().mockResolvedValue(makeCourse({ id: `${label}-get` })),
    save: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    duplicate: jest.fn().mockResolvedValue(makeCourse({ id: `${label}-dup` })),
  });

  let firestore: jest.Mocked<CourseRepository>;
  let local: jest.Mocked<CourseRepository>;
  let signedIn: boolean;
  let repo: DelegatingCourseRepository;

  beforeEach(() => {
    firestore = stubRepo('fs');
    local = stubRepo('local');
    signedIn = false;
    repo = new DelegatingCourseRepository({ firestore, local, useFirestore: () => signedIn });
  });

  it('routes every method to local when useFirestore() is false', async () => {
    const course = makeCourse();
    await expect(repo.list()).resolves.toEqual([makeCourse({ id: 'local-list' })]);
    await repo.get('x');
    await repo.save(course);
    await repo.delete('x');
    await repo.duplicate('x');

    expect(local.list).toHaveBeenCalledTimes(1);
    expect(local.get).toHaveBeenCalledWith('x');
    expect(local.save).toHaveBeenCalledWith(course);
    expect(local.delete).toHaveBeenCalledWith('x');
    expect(local.duplicate).toHaveBeenCalledWith('x');
    expect(firestore.list).not.toHaveBeenCalled();
    expect(firestore.save).not.toHaveBeenCalled();
  });

  it('routes every method to firestore when useFirestore() is true', async () => {
    signedIn = true;
    await expect(repo.list()).resolves.toEqual([makeCourse({ id: 'fs-list' })]);
    await repo.get('x');
    await repo.save(makeCourse());
    await repo.delete('x');
    await expect(repo.duplicate('x')).resolves.toEqual(makeCourse({ id: 'fs-dup' }));

    expect(firestore.list).toHaveBeenCalledTimes(1);
    expect(firestore.duplicate).toHaveBeenCalledWith('x');
    expect(local.list).not.toHaveBeenCalled();
  });

  it('re-evaluates useFirestore() on every call (mid-session sign-in)', async () => {
    await repo.list();
    signedIn = true;
    await repo.list();
    signedIn = false;
    await repo.list();

    expect(local.list).toHaveBeenCalledTimes(2);
    expect(firestore.list).toHaveBeenCalledTimes(1);
  });
});
