import { TestBed } from '@angular/core/testing';
import type { Course, Enrollment } from '@forge/shared';
import { FIRESTORE } from '@forge/data-access';
import { CourseCatalogService } from './course-catalog.service';
import { EnrollmentService } from './enrollment.service';

const setDocMock = jest.fn();
const getDocMock = jest.fn();
jest.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));
jest.mock('@forge/data-access', () => ({
  FIRESTORE: new (jest.requireActual('@angular/core').InjectionToken)('forge.firestore'),
  enrollmentDoc: jest.fn(() => ({ __ref: true })),
}));

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
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let listPublished: jest.Mock;

  beforeEach(() => {
    setDocMock.mockReset();
    getDocMock.mockReset();
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

  it('enroll is idempotent: returns the existing enrollment without writing', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => true, data: () => enrollment('c1') });
    const result = await service.enroll('atl-airport', 'c1', 'u1', 'u1@atl.test');
    expect(result.courseId).toBe('c1');
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('enroll creates a fresh enrollment when none exists', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    const result = await service.enroll('atl-airport', 'c1', 'u1', 'u1@atl.test');
    expect(result.uid).toBe('u1');
    expect(result.progressPct).toBe(0);
    expect(result.completed).toBe(false);
    expect(setDocMock).toHaveBeenCalledTimes(1);
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
