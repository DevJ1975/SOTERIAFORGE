import { TestBed } from '@angular/core/testing';
import type { Course, Enrollment } from '@forge/shared';
import { FIRESTORE } from '@forge/data-access';
import { CourseCatalogService } from './course-catalog.service';
import { EnrollmentService } from './enrollment.service';

const getDocMock = jest.fn();
const runTransactionMock = jest.fn();
jest.mock('firebase/firestore', () => ({
  getDoc: (...args: unknown[]) => getDocMock(...args),
  runTransaction: (...args: unknown[]) => runTransactionMock(...args),
}));
jest.mock('@forge/data-access', () => ({
  FIRESTORE: new (jest.requireActual('@angular/core').InjectionToken)('forge.firestore'),
  enrollmentDoc: jest.fn(() => ({ __ref: true })),
}));

/**
 * A transaction stand-in over a single mutable enrollment slot. `enroll` reads
 * inside the txn and creates only if absent, so this models the create-if-absent
 * race: the second caller reads the first's write and returns it untouched.
 */
function makeTx(store: { enrollment?: Enrollment }) {
  return {
    get: jest.fn(async () => ({
      exists: () => store.enrollment !== undefined,
      data: () => store.enrollment as Enrollment,
    })),
    set: jest.fn((_ref: unknown, value: Enrollment) => {
      store.enrollment = value;
    }),
  };
}

const course = (id: string): Course => ({
  id,
  tenantId: 'atl-airport',
  title: `Course ${id}`,
  description: '',
  status: 'published',
  tags: [],
  badgeRefs: [],
  xpReward: 100,
  createdAt: '2026-01-01T00:00:00.000Z',
});

const enrollment = (courseId: string): Enrollment => ({
  uid: 'u1',
  courseId,
  tenantId: 'atl-airport',
  progressPct: 0,
  completed: false,
  progressVersion: 0,
  completedLessonIds: [],
  attemptCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let listPublished: jest.Mock;
  let store: { enrollment?: Enrollment };

  beforeEach(() => {
    getDocMock.mockReset();
    runTransactionMock.mockReset();
    store = {};
    runTransactionMock.mockImplementation(async (_db: unknown, fn: (tx: unknown) => unknown) =>
      fn(makeTx(store)),
    );
    listPublished = jest.fn().mockResolvedValue([]);
    TestBed.configureTestingModule({
      providers: [
        EnrollmentService,
        { provide: FIRESTORE, useValue: {} },
        { provide: CourseCatalogService, useValue: { listPublished } },
      ],
    });
    service = TestBed.inject(EnrollmentService);
  });

  it('enroll is idempotent: returns the existing enrollment without creating', async () => {
    store.enrollment = enrollment('c1');
    const result = await service.enroll('atl-airport', 'c1', 'u1', 'u1@atl.test');
    expect(result.courseId).toBe('c1');
    // The pre-existing doc is returned untouched (no new createdAt stamp).
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('enroll creates a fresh enrollment when none exists', async () => {
    const result = await service.enroll('atl-airport', 'c1', 'u1', 'u1@atl.test');
    expect(result.uid).toBe('u1');
    expect(result.progressPct).toBe(0);
    expect(result.completed).toBe(false);
    expect(store.enrollment).toBeDefined();
  });

  it('two parallel enrolls do not both create: the second returns the first (transactional)', async () => {
    const first = await service.enroll('atl-airport', 'c1', 'u1', 'u1@atl.test');
    const second = await service.enroll('atl-airport', 'c1', 'u1', 'u1@atl.test');
    // The second transaction reads the first's write and returns it untouched.
    expect(second.createdAt).toBe(first.createdAt);
    expect(runTransactionMock).toHaveBeenCalledTimes(2);
  });

  it('listMyEnrollments pairs only enrolled courses with their metadata', async () => {
    listPublished.mockResolvedValueOnce([course('c1'), course('c2')]);
    getDocMock
      .mockResolvedValueOnce({ exists: () => true, data: () => enrollment('c1') })
      .mockResolvedValueOnce({ exists: () => false });
    const result = await service.listMyEnrollments('atl-airport', 'u1');
    expect(result).toHaveLength(1);
    expect(result[0].course.id).toBe('c1');
    expect(result[0].enrollment.courseId).toBe('c1');
  });
});
