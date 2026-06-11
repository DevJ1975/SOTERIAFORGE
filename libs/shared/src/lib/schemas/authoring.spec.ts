import {
  block,
  courseDraft,
  knowledgeCheckBlock,
  lessonDraft,
  quizBlock,
  quizQuestion,
} from './authoring';

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
        {
          id: 'b16',
          kind: 'quiz',
          title: 'Forklift final check',
          passingScore: 80,
          shuffleQuestions: false,
          questions: [
            {
              id: 'q1',
              type: 'mcq',
              prompt: 'What states the rated capacity?',
              options: [
                { id: 'q1o1', text: 'The data plate' },
                { id: 'q1o2', text: 'The seat belt' },
              ],
              correctOptionId: 'q1o1',
            },
          ],
        },
      ],
    },
  ],
};

// Individual valid questions, one per type (kept separate so per-type
// invariant tests can spread and break a single field).
const mcqQ = {
  id: 'q-mcq',
  type: 'mcq',
  prompt: 'When must the daily inspection happen?',
  options: [
    { id: 'm1', text: 'Before each shift' },
    { id: 'm2', text: 'Once a month' },
    { id: 'm3', text: 'Only after an incident' },
  ],
  correctOptionId: 'm1',
  explanation: 'OSHA requires a pre-shift inspection.',
};

const multiSelectQ = {
  id: 'q-ms',
  type: 'multi_select',
  prompt: 'Which items are part of the walkaround?',
  options: [
    { id: 's1', text: 'Tires' },
    { id: 's2', text: 'Forks' },
    { id: 's3', text: 'Radio presets' },
  ],
  correctOptionIds: ['s1', 's2'],
};

const trueFalseQ = {
  id: 'q-tf',
  type: 'true_false',
  prompt: 'Loads are carried tilted back.',
  correct: true,
};

const orderingQ = {
  id: 'q-ord',
  type: 'ordering',
  prompt: 'Order the shutdown steps.',
  items: [
    { id: 'o1', text: 'Park' },
    { id: 'o2', text: 'Lower forks' },
    { id: 'o3', text: 'Set the brake' },
  ],
};

const matchingQ = {
  id: 'q-match',
  type: 'matching',
  prompt: 'Match the control to its function.',
  pairs: [
    { id: 'p1', left: 'Tilt lever', right: 'Angles the mast' },
    { id: 'p2', left: 'Lift lever', right: 'Raises the forks' },
  ],
};

const fillInQ = {
  id: 'q-fill',
  type: 'fill_in',
  prompt: 'The ____ states the rated capacity.',
  acceptedAnswers: ['data plate', 'nameplate'],
};

/** A fully-populated quiz block exercising all six question types. */
const validQuiz = {
  id: 'quiz-1',
  kind: 'quiz',
  title: 'Final assessment',
  passingScore: 70,
  shuffleQuestions: true,
  questions: [mcqQ, multiSelectQ, trueFalseQ, orderingQ, matchingQ, fillInQ],
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

describe('quizBlock', () => {
  it('parses a valid quiz containing all six question types', () => {
    const parsed = quizBlock.parse(validQuiz);
    expect(parsed.questions).toHaveLength(6);
    expect(parsed.questions.map((q) => q.type)).toEqual([
      'mcq',
      'multi_select',
      'true_false',
      'ordering',
      'matching',
      'fill_in',
    ]);
  });

  it('round-trips through the block union', () => {
    const parsed = block.parse(validQuiz);
    expect(parsed.kind).toBe('quiz');
  });

  it('applies defaults for title, passing score, and shuffle', () => {
    const parsed = quizBlock.parse({
      id: 'quiz-2',
      kind: 'quiz',
      questions: validQuiz.questions.slice(0, 1),
    });
    expect(parsed.title).toBe('Quiz');
    expect(parsed.passingScore).toBe(80);
    expect(parsed.shuffleQuestions).toBe(false);
  });

  it('requires at least one question', () => {
    expect(quizBlock.safeParse({ ...validQuiz, questions: [] }).success).toBe(false);
  });

  it('clamps the passing score to 0..100', () => {
    expect(quizBlock.safeParse({ ...validQuiz, passingScore: 101 }).success).toBe(false);
    expect(quizBlock.safeParse({ ...validQuiz, passingScore: -1 }).success).toBe(false);
    expect(quizBlock.safeParse({ ...validQuiz, passingScore: 0 }).success).toBe(true);
    expect(quizBlock.safeParse({ ...validQuiz, passingScore: 100 }).success).toBe(true);
  });

  it('rejects unknown question types', () => {
    const result = quizQuestion.safeParse({
      id: 'q-bad',
      type: 'essay',
      prompt: 'Write 500 words…',
    });
    expect(result.success).toBe(false);
  });

  it('discriminates on type: mcq fields are rejected on a true_false question', () => {
    const result = quizQuestion.safeParse({
      id: 'q-tf',
      type: 'true_false',
      prompt: 'Yes?',
      // missing `correct`
    });
    expect(result.success).toBe(false);
  });

  it('mcq: requires at least 2 options and a correctOptionId that exists', () => {
    expect(quizQuestion.safeParse({ ...mcqQ, options: mcqQ.options.slice(0, 1) }).success).toBe(
      false,
    );
    expect(quizQuestion.safeParse({ ...mcqQ, correctOptionId: 'ghost' }).success).toBe(false);
    expect(quizQuestion.safeParse(mcqQ).success).toBe(true);
  });

  it('multi_select: requires 1+ correct ids, all referencing real options', () => {
    expect(quizQuestion.safeParse({ ...multiSelectQ, correctOptionIds: [] }).success).toBe(false);
    expect(
      quizQuestion.safeParse({ ...multiSelectQ, correctOptionIds: ['s1', 'ghost'] }).success,
    ).toBe(false);
    expect(quizQuestion.safeParse(multiSelectQ).success).toBe(true);
  });

  it('ordering: requires at least 2 items', () => {
    expect(
      quizQuestion.safeParse({ ...orderingQ, items: [{ id: 'o1', text: 'Park' }] }).success,
    ).toBe(false);
  });

  it('matching: requires at least 2 pairs', () => {
    expect(
      quizQuestion.safeParse({
        ...matchingQ,
        pairs: [{ id: 'p1', left: 'Tilt', right: 'Angles the mast' }],
      }).success,
    ).toBe(false);
  });

  it('fill_in: requires at least 1 accepted answer', () => {
    expect(quizQuestion.safeParse({ ...fillInQ, acceptedAnswers: [] }).success).toBe(false);
  });
});

describe('lessonDraft', () => {
  it('requires a title and defaults blocks to empty', () => {
    expect(lessonDraft.safeParse({ id: 'l1', title: '' }).success).toBe(false);
    const parsed = lessonDraft.parse({ id: 'l1', title: 'Load Handling' });
    expect(parsed.blocks).toEqual([]);
  });
});
