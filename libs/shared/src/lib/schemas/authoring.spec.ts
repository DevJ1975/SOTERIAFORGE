import { block, courseDraft, knowledgeCheckBlock, lessonDraft, videoBlock } from './authoring';

const timestamps = {
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-01T08:30:00Z',
};

const validCourse = {
  ...timestamps,
  id: 'course-1',
  title: 'Forklift Safety Fundamentals',
  description: 'Operate powered industrial trucks safely.',
  status: 'draft',
  lessons: [
    {
      id: 'lesson-1',
      title: 'Pre-Operation Inspection',
      blocks: [
        { id: 'b1', kind: 'heading', text: 'Before you turn the key', level: 2 },
        { id: 'b2', kind: 'paragraph', html: 'Inspect the <strong>forks</strong> for cracks.' },
        {
          id: 'b3',
          kind: 'image',
          url: 'https://example.com/forklift.jpg',
          alt: 'A counterbalance forklift',
          layout: 'centered',
        },
        { id: 'b4', kind: 'video', url: 'https://youtu.be/abc123', caption: 'Daily walkaround' },
        {
          id: 'b4b',
          kind: 'video',
          url: 'https://storage.example.com/walkaround.mp4?token=abc',
          caption: 'Hosted walkaround',
          storagePath: 'tenants/atl-airport/courses/course-1/videos/walkaround.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 10_485_760,
          durationSec: 92.5,
        },
        { id: 'b5', kind: 'bulletList', items: ['Tires', 'Forks', 'Mast chains'] },
        { id: 'b6', kind: 'numberedList', items: ['Park', 'Lower forks', 'Set brake'] },
        { id: 'b7', kind: 'quote', text: 'Safety is no accident.', attribution: 'Site manager' },
        {
          id: 'b8',
          kind: 'callout',
          tone: 'warning',
          title: 'Tag it out',
          html: 'Report defects.',
        },
        { id: 'b9', kind: 'divider', style: 'line' },
        {
          id: 'b10',
          kind: 'button',
          label: 'OSHA standard',
          url: 'https://www.osha.gov',
          style: 'primary',
        },
        { id: 'b11', kind: 'embed', url: 'https://www.osha.gov/etools', height: 400 },
        {
          id: 'b12',
          kind: 'accordion',
          items: [{ id: 'a1', title: 'Hydraulics', html: 'Check for leaks.' }],
        },
        {
          id: 'b13',
          kind: 'tabs',
          items: [{ id: 't1', title: 'Electric', html: 'Check the battery.' }],
        },
        {
          id: 'b14',
          kind: 'flashcards',
          cards: [{ id: 'c1', front: 'Data plate', back: 'States rated capacity.' }],
        },
        {
          id: 'b15',
          kind: 'knowledgeCheck',
          question: 'When must the daily inspection happen?',
          type: 'mcq',
          options: [
            { id: 'o1', text: 'Before each shift', correct: true },
            { id: 'o2', text: 'Once a month', correct: false },
          ],
          feedbackCorrect: 'Right — before every shift.',
          feedbackIncorrect: 'No — OSHA requires a pre-shift inspection.',
        },
      ],
    },
  ],
};

describe('courseDraft', () => {
  it('parses a valid course containing every block kind', () => {
    const parsed = courseDraft.parse(validCourse);
    expect(parsed.lessons[0].blocks).toHaveLength(16);
    expect(parsed.status).toBe('draft');
  });

  it('applies defaults for description, status, and lessons', () => {
    const parsed = courseDraft.parse({
      ...timestamps,
      id: 'course-2',
      title: 'Lockout/Tagout',
    });
    expect(parsed.description).toBe('');
    expect(parsed.status).toBe('draft');
    expect(parsed.lessons).toEqual([]);
  });

  it('rejects unknown publish statuses', () => {
    expect(courseDraft.safeParse({ ...validCourse, status: 'in_review' }).success).toBe(false);
  });
});

describe('block', () => {
  it('rejects unknown block kinds', () => {
    const result = block.safeParse({ id: 'x', kind: 'carousel', images: [] });
    expect(result.success).toBe(false);
  });

  it('applies per-kind defaults', () => {
    const heading = block.parse({ id: 'h', kind: 'heading' });
    expect(heading).toMatchObject({ kind: 'heading', text: '', level: 2 });

    const image = block.parse({ id: 'i', kind: 'image' });
    expect(image).toMatchObject({ layout: 'full', url: '', alt: '' });

    const callout = block.parse({ id: 'c', kind: 'callout' });
    expect(callout).toMatchObject({ tone: 'info', html: '' });

    const divider = block.parse({ id: 'd', kind: 'divider' });
    expect(divider).toMatchObject({ style: 'line' });

    const button = block.parse({ id: 'b', kind: 'button' });
    expect(button).toMatchObject({ style: 'primary' });

    const embed = block.parse({ id: 'e', kind: 'embed' });
    expect(embed).toMatchObject({ height: 480 });
  });
});

describe('knowledgeCheckBlock', () => {
  it('rejects fewer than 2 options', () => {
    const result = knowledgeCheckBlock.safeParse({
      id: 'kc',
      kind: 'knowledgeCheck',
      question: 'True or false?',
      type: 'true_false',
      options: [{ id: 'o1', text: 'True', correct: true }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts 2+ options and defaults the feedback copy', () => {
    const parsed = knowledgeCheckBlock.parse({
      id: 'kc',
      kind: 'knowledgeCheck',
      question: 'Loads are carried tilted back?',
      options: [
        { id: 'o1', text: 'True', correct: true },
        { id: 'o2', text: 'False' },
      ],
    });
    expect(parsed.type).toBe('mcq');
    expect(parsed.feedbackCorrect.length).toBeGreaterThan(0);
    expect(parsed.options[1].correct).toBe(false);
  });
});

describe('videoBlock', () => {
  it('parses a legacy external embed (url only, no storagePath)', () => {
    const parsed = videoBlock.parse({
      id: 'v1',
      kind: 'video',
      url: 'https://youtu.be/abc123',
      caption: 'Walkaround',
    });
    expect(parsed.url).toBe('https://youtu.be/abc123');
    expect(parsed.storagePath).toBeUndefined();
    expect(parsed.mimeType).toBeUndefined();
    expect(parsed.sizeBytes).toBeUndefined();
    expect(parsed.durationSec).toBeUndefined();
  });

  it('parses an uploaded asset with the offline metadata fields', () => {
    const parsed = videoBlock.parse({
      id: 'v2',
      kind: 'video',
      url: 'https://storage.example.com/clip.mp4',
      storagePath: 'tenants/atl-airport/courses/c1/videos/clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2048,
      durationSec: 30,
    });
    expect(parsed.storagePath).toBe('tenants/atl-airport/courses/c1/videos/clip.mp4');
    expect(parsed.mimeType).toBe('video/mp4');
    expect(parsed.sizeBytes).toBe(2048);
    expect(parsed.durationSec).toBe(30);
  });

  it('defaults url to an empty string and stays backward compatible', () => {
    const parsed = videoBlock.parse({ id: 'v3', kind: 'video' });
    expect(parsed.url).toBe('');
    expect(parsed.storagePath).toBeUndefined();
  });

  it('rejects a fractional or negative sizeBytes and a negative durationSec', () => {
    const base = { id: 'v4', kind: 'video', url: '' };
    expect(videoBlock.safeParse({ ...base, sizeBytes: 1.5 }).success).toBe(false);
    expect(videoBlock.safeParse({ ...base, sizeBytes: -1 }).success).toBe(false);
    expect(videoBlock.safeParse({ ...base, durationSec: -0.1 }).success).toBe(false);
  });
});

describe('lessonDraft', () => {
  it('requires a title and defaults blocks to empty', () => {
    expect(lessonDraft.safeParse({ id: 'l1', title: '' }).success).toBe(false);
    const parsed = lessonDraft.parse({ id: 'l1', title: 'Load Handling' });
    expect(parsed.blocks).toEqual([]);
  });
});
