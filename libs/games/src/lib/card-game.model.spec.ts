import {
  CardGameConfig,
  FlipRevealConfig,
  MatchPairsConfig,
  ScenarioCardsConfig,
  SortBucketsConfig,
  validateCardGameConfig,
} from './card-game.model';

// ---------------------------------------------------------------------------
// Helpers: minimal valid configs per kind
// ---------------------------------------------------------------------------

function validFlipReveal(): FlipRevealConfig {
  return {
    kind: 'flip_reveal',
    title: 'Flip Quiz',
    cards: [
      { id: 'c1', label: 'Card 1', revealText: 'Answer 1' },
      { id: 'c2', label: 'Card 2', revealText: 'Answer 2' },
    ],
  };
}

function validMatchPairs(): MatchPairsConfig {
  return {
    kind: 'match_pairs',
    title: 'Match It',
    pairs: [
      {
        id: 'p1',
        question: { id: 'q1', label: 'Question 1' },
        answer: { id: 'a1', label: 'Answer 1' },
      },
      {
        id: 'p2',
        question: { id: 'q2', label: 'Question 2' },
        answer: { id: 'a2', label: 'Answer 2' },
      },
    ],
  };
}

function validSortBuckets(): SortBucketsConfig {
  return {
    kind: 'sort_buckets',
    title: 'Sort It',
    cards: [
      { id: 'card1', label: 'Card A' },
      { id: 'card2', label: 'Card B' },
    ],
    buckets: [
      { id: 'bucket1', label: 'Bucket 1', correctCardIds: ['card1'] },
      { id: 'bucket2', label: 'Bucket 2', correctCardIds: ['card2'] },
    ],
  };
}

function validScenarioCards(): ScenarioCardsConfig {
  return {
    kind: 'scenario_cards',
    title: 'Scenario Quiz',
    scenarios: [
      {
        id: 's1',
        prompt: 'What do you do?',
        choices: [
          { id: 'ch1', text: 'Good choice', isCorrect: true },
          { id: 'ch2', text: 'Bad choice', isCorrect: false },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// flip_reveal
// ---------------------------------------------------------------------------

describe('validateCardGameConfig — flip_reveal', () => {
  it('returns no errors for a valid config', () => {
    expect(validateCardGameConfig(validFlipReveal())).toHaveLength(0);
  });

  it('errors when title is empty', () => {
    const cfg: FlipRevealConfig = { ...validFlipReveal(), title: '' };
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('title'))).toBe(true);
  });

  it('errors when cards array is empty', () => {
    const cfg: FlipRevealConfig = { ...validFlipReveal(), cards: [] };
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('card'))).toBe(true);
  });

  it('errors when a card has no id', () => {
    const cfg = validFlipReveal();
    cfg.cards[0] = { ...cfg.cards[0], id: '' };
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('errors when a card has no label and no imageUrl', () => {
    const cfg = validFlipReveal();
    cfg.cards[0] = { id: 'c1', label: '', revealText: 'something' };
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('label or imageUrl'))).toBe(true);
  });

  it('accepts a card with imageUrl instead of label', () => {
    const cfg = validFlipReveal();
    cfg.cards[0] = { id: 'c1', label: '', imageUrl: 'http://example.com/img.png', revealText: 'x' };
    expect(validateCardGameConfig(cfg)).toHaveLength(0);
  });

  it('errors when a card is missing revealText', () => {
    const cfg = validFlipReveal();
    cfg.cards[0] = { ...cfg.cards[0], revealText: '' };
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('revealText'))).toBe(true);
  });

  it('errors on duplicate card ids', () => {
    const cfg = validFlipReveal();
    cfg.cards[1] = { ...cfg.cards[0] }; // same id as cards[0]
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('unique'))).toBe(true);
  });

  it('errors when visibleCount < 1', () => {
    const cfg: FlipRevealConfig = { ...validFlipReveal(), visibleCount: 0 };
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('visibleCount'))).toBe(true);
  });

  it('accepts visibleCount >= 1', () => {
    const cfg: FlipRevealConfig = { ...validFlipReveal(), visibleCount: 2 };
    expect(validateCardGameConfig(cfg)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// match_pairs
// ---------------------------------------------------------------------------

describe('validateCardGameConfig — match_pairs', () => {
  it('returns no errors for a valid config', () => {
    expect(validateCardGameConfig(validMatchPairs())).toHaveLength(0);
  });

  it('errors when title is missing', () => {
    const cfg = { ...validMatchPairs(), title: '   ' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('title'))).toBe(true);
  });

  it('errors when fewer than 2 pairs are provided', () => {
    const cfg = validMatchPairs();
    cfg.pairs = cfg.pairs.slice(0, 1);
    const errors = validateCardGameConfig(cfg);
    expect(errors.some((e) => e.includes('2 pairs'))).toBe(true);
  });

  it('errors when a pair has no id', () => {
    const cfg = validMatchPairs();
    cfg.pairs[0] = { ...cfg.pairs[0], id: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('id'))).toBe(true);
  });

  it('errors when a pair question has no id', () => {
    const cfg = validMatchPairs();
    cfg.pairs[0] = { ...cfg.pairs[0], question: { ...cfg.pairs[0].question, id: '' } };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('question'))).toBe(true);
  });

  it('errors when a pair answer has no id', () => {
    const cfg = validMatchPairs();
    cfg.pairs[0] = { ...cfg.pairs[0], answer: { ...cfg.pairs[0].answer, id: '' } };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('answer'))).toBe(true);
  });

  it('errors on duplicate pair ids', () => {
    const cfg = validMatchPairs();
    cfg.pairs[1] = { ...cfg.pairs[0] }; // duplicate id
    expect(validateCardGameConfig(cfg).some((e) => e.includes('unique'))).toBe(true);
  });

  it('errors when timeLimitSeconds is negative', () => {
    const cfg: MatchPairsConfig = { ...validMatchPairs(), timeLimitSeconds: -1 };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('timeLimitSeconds'))).toBe(true);
  });

  it('accepts timeLimitSeconds of 0 (no limit)', () => {
    const cfg: MatchPairsConfig = { ...validMatchPairs(), timeLimitSeconds: 0 };
    expect(validateCardGameConfig(cfg)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sort_buckets
// ---------------------------------------------------------------------------

describe('validateCardGameConfig — sort_buckets', () => {
  it('returns no errors for a valid config', () => {
    expect(validateCardGameConfig(validSortBuckets())).toHaveLength(0);
  });

  it('errors when title is empty', () => {
    const cfg = { ...validSortBuckets(), title: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('title'))).toBe(true);
  });

  it('errors when cards array is empty', () => {
    const cfg = { ...validSortBuckets(), cards: [] };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('card'))).toBe(true);
  });

  it('errors when fewer than 2 buckets are provided', () => {
    const cfg = validSortBuckets();
    cfg.buckets = cfg.buckets.slice(0, 1);
    expect(validateCardGameConfig(cfg).some((e) => e.includes('2 bucket'))).toBe(true);
  });

  it('errors when a bucket has no id', () => {
    const cfg = validSortBuckets();
    cfg.buckets[0] = { ...cfg.buckets[0], id: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('id'))).toBe(true);
  });

  it('errors when a bucket has no label', () => {
    const cfg = validSortBuckets();
    cfg.buckets[0] = { ...cfg.buckets[0], label: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('label'))).toBe(true);
  });

  it('errors when a bucket references a non-existent card id', () => {
    const cfg = validSortBuckets();
    cfg.buckets[0] = { ...cfg.buckets[0], correctCardIds: ['nonexistent'] };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('not found'))).toBe(true);
  });

  it('errors on duplicate card ids', () => {
    const cfg = validSortBuckets();
    cfg.cards[1] = { ...cfg.cards[0] }; // duplicate id
    expect(validateCardGameConfig(cfg).some((e) => e.includes('unique'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// scenario_cards
// ---------------------------------------------------------------------------

describe('validateCardGameConfig — scenario_cards', () => {
  it('returns no errors for a valid config', () => {
    expect(validateCardGameConfig(validScenarioCards())).toHaveLength(0);
  });

  it('errors when title is missing', () => {
    const cfg = { ...validScenarioCards(), title: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('title'))).toBe(true);
  });

  it('errors when scenarios array is empty', () => {
    const cfg = { ...validScenarioCards(), scenarios: [] };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('scenario'))).toBe(true);
  });

  it('errors when a scenario has no id', () => {
    const cfg = validScenarioCards();
    cfg.scenarios[0] = { ...cfg.scenarios[0], id: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('id'))).toBe(true);
  });

  it('errors when a scenario has no prompt', () => {
    const cfg = validScenarioCards();
    cfg.scenarios[0] = { ...cfg.scenarios[0], prompt: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('prompt'))).toBe(true);
  });

  it('errors when fewer than 2 choices are provided', () => {
    const cfg = validScenarioCards();
    cfg.scenarios[0] = {
      ...cfg.scenarios[0],
      choices: [{ id: 'ch1', text: 'Only choice', isCorrect: true }],
    };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('2 choices'))).toBe(true);
  });

  it('errors when no choice is marked correct', () => {
    const cfg = validScenarioCards();
    cfg.scenarios[0] = {
      ...cfg.scenarios[0],
      choices: [
        { id: 'ch1', text: 'Wrong A', isCorrect: false },
        { id: 'ch2', text: 'Wrong B', isCorrect: false },
      ],
    };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('correct'))).toBe(true);
  });

  it('errors when a choice has no id', () => {
    const cfg = validScenarioCards();
    cfg.scenarios[0].choices[0] = { ...cfg.scenarios[0].choices[0], id: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('id'))).toBe(true);
  });

  it('errors when a choice has no text', () => {
    const cfg = validScenarioCards();
    cfg.scenarios[0].choices[0] = { ...cfg.scenarios[0].choices[0], text: '' };
    expect(validateCardGameConfig(cfg).some((e) => e.includes('text'))).toBe(true);
  });

  it('accepts optional fields (showImmediateFeedback, feedback)', () => {
    const cfg: ScenarioCardsConfig = {
      ...validScenarioCards(),
      showImmediateFeedback: false,
    };
    cfg.scenarios[0].choices[0] = { ...cfg.scenarios[0].choices[0], feedback: 'Great job!' };
    expect(validateCardGameConfig(cfg)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Type narrowing — exhaustiveness check
// ---------------------------------------------------------------------------

describe('validateCardGameConfig — union exhaustiveness', () => {
  it('handles all four kinds without throwing', () => {
    const configs: CardGameConfig[] = [
      validFlipReveal(),
      validMatchPairs(),
      validSortBuckets(),
      validScenarioCards(),
    ];
    configs.forEach((cfg) => {
      expect(() => validateCardGameConfig(cfg)).not.toThrow();
    });
  });
});
