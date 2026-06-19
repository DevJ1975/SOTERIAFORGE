import { TestBed } from '@angular/core/testing';
import type { Enrollment } from '@forge/shared';
import { FIRESTORE } from '@forge/data-access';
import { EnrollmentService } from './enrollment.service';
import { ProgressService } from './progress.service';

const setDocMock = jest.fn();
jest.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
}));
jest.mock('@forge/data-access', () => ({
  FIRESTORE: new (jest.requireActual('@angular/core').InjectionToken)('forge.firestore'),
  enrollmentDoc: jest.fn(() => ({ __ref: true })),
}));

describe('ProgressService', () => {
  let service: ProgressService;
  let getEnrollment: jest.Mock;

  beforeEach(() => {
    setDocMock.mockReset();
    getEnrollment = jest.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        ProgressService,
        { provide: FIRESTORE, useValue: {} },
        { provide: EnrollmentService, useValue: { getEnrollment } },
      ],
    });
    service = TestBed.inject(ProgressService);
  });

  it('computes progressPct from completed / total lessons (rounded)', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1'], 3);
    expect(result.progressPct).toBe(33);
    expect(result.completed).toBe(false);
  });

  it('de-duplicates completed lesson ids before computing progress', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1', 'l1'], 2);
    expect(result.progressPct).toBe(50);
  });

  it('marks complete when every lesson is done', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', ['l1', 'l2'], 2);
    expect(result.progressPct).toBe(100);
    expect(result.completed).toBe(true);
  });

  it('guards against a zero-lesson course (no divide-by-zero)', async () => {
    const result = await service.setLessonProgress('atl-airport', 'c1', 'u1', [], 0);
    expect(result.progressPct).toBe(0);
  });

  it('completeCourse forces pct=100, completed=true and persists the score', async () => {
    const result = await service.completeCourse('atl-airport', 'c1', 'u1', 88);
    expect(result.progressPct).toBe(100);
    expect(result.completed).toBe(true);
    expect(result.score).toBe(88);
    expect(setDocMock).toHaveBeenCalledTimes(1);
  });

  it('preserves an existing enrollment score when none is supplied', async () => {
    const existing: Enrollment = {
      uid: 'u1',
      courseId: 'c1',
      tenantId: 'atl-airport',
      progressPct: 40,
      completed: false,
      score: 70,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    getEnrollment.mockResolvedValueOnce(existing);
    const result = await service.completeCourse('atl-airport', 'c1', 'u1');
    expect(result.score).toBe(70);
    expect(result.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
