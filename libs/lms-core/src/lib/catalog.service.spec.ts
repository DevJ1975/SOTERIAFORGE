import type { CourseDraft } from '@forge/shared';
import { excerptOf, sortByUpdatedAtDesc, toCatalogCourse } from './catalog.service';

function draft(overrides: Partial<CourseDraft> = {}): CourseDraft {
  return {
    id: 'course-1',
    title: 'Forklift Safety',
    description: 'Operate forklifts safely.',
    status: 'published',
    lessons: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('excerptOf', () => {
  it('returns short text unchanged', () => {
    expect(excerptOf('Stay alert.')).toBe('Stay alert.');
  });

  it('collapses runs of whitespace and trims', () => {
    expect(excerptOf('  Stay\n\nalert,   stay\talive.  ')).toBe('Stay alert, stay alive.');
  });

  it('truncates long text on a word boundary with an ellipsis', () => {
    const text = `${'word '.repeat(60)}end`;
    const excerpt = excerptOf(text);
    expect(excerpt.length).toBeLessThanOrEqual(160);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt).not.toContain('  ');
    // No chopped word: everything before the ellipsis is a whole token.
    expect(
      excerpt
        .slice(0, -1)
        .split(' ')
        .every((token) => token === 'word'),
    ).toBe(true);
  });

  it('hard-cuts a single unbroken token instead of returning nothing', () => {
    const excerpt = excerptOf('x'.repeat(500), 20);
    expect(excerpt).toBe(`${'x'.repeat(19)}…`);
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(excerptOf('   \n ')).toBe('');
  });
});

describe('toCatalogCourse', () => {
  it('projects id, title, excerpt, cover and lesson count', () => {
    const course = draft({
      coverImageUrl: 'https://example.com/cover.png',
      lessons: [
        { id: 'l1', title: 'Intro', blocks: [] },
        { id: 'l2', title: 'Hazards', blocks: [] },
      ],
    });
    expect(toCatalogCourse(course)).toEqual({
      id: 'course-1',
      title: 'Forklift Safety',
      excerpt: 'Operate forklifts safely.',
      coverImageUrl: 'https://example.com/cover.png',
      lessonCount: 2,
    });
  });

  it('leaves coverImageUrl undefined when the course has none', () => {
    expect(toCatalogCourse(draft()).coverImageUrl).toBeUndefined();
  });
});

describe('sortByUpdatedAtDesc', () => {
  it('orders newest first without mutating the input', () => {
    const older = draft({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = draft({ id: 'b', updatedAt: '2026-03-01T00:00:00.000Z' });
    const input = [older, newer];
    const sorted = sortByUpdatedAtDesc(input);
    expect(sorted.map((course) => course.id)).toEqual(['b', 'a']);
    expect(input.map((course) => course.id)).toEqual(['a', 'b']);
  });
});
