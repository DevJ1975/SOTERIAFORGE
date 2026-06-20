import { module } from './course';

const baseModule = {
  id: 'mod-1',
  courseId: 'course-1',
  tenantId: 'tenant-1',
  title: 'Lesson 1',
  order: 0,
  contentType: 'video' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('module schema — estimatedMinutes (MO-14)', () => {
  it('accepts a module with an integer estimatedMinutes', () => {
    const parsed = module.parse({ ...baseModule, estimatedMinutes: 5 });
    expect(parsed.estimatedMinutes).toBe(5);
  });

  it('omits estimatedMinutes when not provided (backwards compatible)', () => {
    const parsed = module.parse(baseModule);
    expect(parsed.estimatedMinutes).toBeUndefined();
  });

  it('accepts zero minutes', () => {
    const parsed = module.parse({ ...baseModule, estimatedMinutes: 0 });
    expect(parsed.estimatedMinutes).toBe(0);
  });

  it('rejects a negative estimatedMinutes', () => {
    expect(() => module.parse({ ...baseModule, estimatedMinutes: -1 })).toThrow();
  });

  it('rejects a non-integer estimatedMinutes', () => {
    expect(() => module.parse({ ...baseModule, estimatedMinutes: 2.5 })).toThrow();
  });
});
