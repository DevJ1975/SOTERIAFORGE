/**
 * Card-game configuration model for no-code game templates.
 *
 * Each `CardGameConfig` variant is a discriminated union keyed on `kind`.
 * The `validateCardGameConfig` function provides pure, side-effect-free
 * validation and returns a list of human-readable error strings (empty = valid).
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export interface CardAsset {
  /** Unique card identifier within the config. */
  id: string;
  /** Display label shown on the card face. */
  label: string;
  /** Optional image URL for the card face. */
  imageUrl?: string;
}

export interface BucketDef {
  id: string;
  label: string;
  /** Card ids that belong in this bucket (correct answer key). */
  correctCardIds: string[];
}

export interface ScenarioCard {
  id: string;
  /** Situation / prompt text shown to the learner. */
  prompt: string;
  /** Possible responses the learner can choose from. */
  choices: Array<{
    id: string;
    text: string;
    /** Whether this choice is the recommended / correct one. */
    isCorrect: boolean;
    /** Optional feedback shown after selection. */
    feedback?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Discriminated union variants
// ---------------------------------------------------------------------------

/**
 * Flip-and-reveal: each card has a hidden face; learner flips to reveal the answer.
 */
export interface FlipRevealConfig {
  kind: 'flip_reveal';
  title: string;
  /** Cards to display. Each must have an imageUrl or label for the hidden face. */
  cards: Array<CardAsset & { revealText: string }>;
  /** Number of cards shown simultaneously (default: all). */
  visibleCount?: number;
}

/**
 * Match-pairs (memory game): learner matches two cards that belong together.
 */
export interface MatchPairsConfig {
  kind: 'match_pairs';
  title: string;
  /**
   * Pairs to match. `pairs` length must be >= 2.
   * Each pair has a `question` card and an `answer` card.
   */
  pairs: Array<{
    id: string;
    question: CardAsset;
    answer: CardAsset;
  }>;
  /** Shuffle cards before display (default: true). */
  shuffle?: boolean;
  /** Time limit in seconds; 0 or omitted = no limit. */
  timeLimitSeconds?: number;
}

/**
 * Sort-buckets: learner drags cards into labelled buckets.
 */
export interface SortBucketsConfig {
  kind: 'sort_buckets';
  title: string;
  cards: CardAsset[];
  buckets: BucketDef[];
  /** Allow a card to belong to more than one bucket (default: false). */
  allowMultiBucket?: boolean;
}

/**
 * Scenario-cards: learner reads a situation and picks the best response.
 */
export interface ScenarioCardsConfig {
  kind: 'scenario_cards';
  title: string;
  scenarios: ScenarioCard[];
  /** Show correct-answer feedback immediately after each selection (default: true). */
  showImmediateFeedback?: boolean;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type CardGameConfig =
  | FlipRevealConfig
  | MatchPairsConfig
  | SortBucketsConfig
  | ScenarioCardsConfig;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateFlipReveal(cfg: FlipRevealConfig): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(cfg.title)) errors.push('flip_reveal: title is required');
  if (!Array.isArray(cfg.cards) || cfg.cards.length === 0) {
    errors.push('flip_reveal: at least one card is required');
  } else {
    cfg.cards.forEach((c, i) => {
      if (!isNonEmptyString(c.id)) errors.push(`flip_reveal.cards[${i}]: id is required`);
      if (!isNonEmptyString(c.label) && !c.imageUrl)
        errors.push(`flip_reveal.cards[${i}]: label or imageUrl is required`);
      if (!isNonEmptyString(c.revealText))
        errors.push(`flip_reveal.cards[${i}]: revealText is required`);
    });
    const ids = cfg.cards.map((c) => c.id);
    if (new Set(ids).size !== ids.length) errors.push('flip_reveal: card ids must be unique');
  }
  if (cfg.visibleCount !== undefined && cfg.visibleCount < 1)
    errors.push('flip_reveal: visibleCount must be >= 1');
  return errors;
}

function validateMatchPairs(cfg: MatchPairsConfig): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(cfg.title)) errors.push('match_pairs: title is required');
  if (!Array.isArray(cfg.pairs) || cfg.pairs.length < 2) {
    errors.push('match_pairs: at least 2 pairs are required');
  } else {
    cfg.pairs.forEach((p, i) => {
      if (!isNonEmptyString(p.id)) errors.push(`match_pairs.pairs[${i}]: id is required`);
      if (!isNonEmptyString(p.question?.id))
        errors.push(`match_pairs.pairs[${i}].question: id is required`);
      if (!isNonEmptyString(p.answer?.id))
        errors.push(`match_pairs.pairs[${i}].answer: id is required`);
    });
    const ids = cfg.pairs.map((p) => p.id);
    if (new Set(ids).size !== ids.length) errors.push('match_pairs: pair ids must be unique');
  }
  if (cfg.timeLimitSeconds !== undefined && cfg.timeLimitSeconds < 0)
    errors.push('match_pairs: timeLimitSeconds must be >= 0');
  return errors;
}

function validateSortBuckets(cfg: SortBucketsConfig): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(cfg.title)) errors.push('sort_buckets: title is required');
  if (!Array.isArray(cfg.cards) || cfg.cards.length === 0)
    errors.push('sort_buckets: at least one card is required');
  if (!Array.isArray(cfg.buckets) || cfg.buckets.length < 2)
    errors.push('sort_buckets: at least 2 buckets are required');
  if (Array.isArray(cfg.cards)) {
    const cardIds = new Set(cfg.cards.map((c) => c.id));
    cfg.buckets?.forEach((b, i) => {
      if (!isNonEmptyString(b.id)) errors.push(`sort_buckets.buckets[${i}]: id is required`);
      if (!isNonEmptyString(b.label)) errors.push(`sort_buckets.buckets[${i}]: label is required`);
      b.correctCardIds?.forEach((cid) => {
        if (!cardIds.has(cid))
          errors.push(`sort_buckets.buckets[${i}]: correctCardId "${cid}" not found in cards`);
      });
    });
    const cardIdArr = cfg.cards.map((c) => c.id);
    if (new Set(cardIdArr).size !== cardIdArr.length)
      errors.push('sort_buckets: card ids must be unique');
  }
  return errors;
}

function validateScenarioCards(cfg: ScenarioCardsConfig): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(cfg.title)) errors.push('scenario_cards: title is required');
  if (!Array.isArray(cfg.scenarios) || cfg.scenarios.length === 0)
    errors.push('scenario_cards: at least one scenario is required');
  else {
    cfg.scenarios.forEach((s, i) => {
      if (!isNonEmptyString(s.id)) errors.push(`scenario_cards.scenarios[${i}]: id is required`);
      if (!isNonEmptyString(s.prompt))
        errors.push(`scenario_cards.scenarios[${i}]: prompt is required`);
      if (!Array.isArray(s.choices) || s.choices.length < 2)
        errors.push(`scenario_cards.scenarios[${i}]: at least 2 choices are required`);
      else {
        const hasCorrect = s.choices.some((c) => c.isCorrect);
        if (!hasCorrect)
          errors.push(`scenario_cards.scenarios[${i}]: at least one choice must be correct`);
        s.choices.forEach((c, j) => {
          if (!isNonEmptyString(c.id))
            errors.push(`scenario_cards.scenarios[${i}].choices[${j}]: id is required`);
          if (!isNonEmptyString(c.text))
            errors.push(`scenario_cards.scenarios[${i}].choices[${j}]: text is required`);
        });
      }
    });
  }
  return errors;
}

/**
 * Validates a `CardGameConfig` and returns a list of error strings.
 * An empty array means the config is valid.
 */
export function validateCardGameConfig(config: CardGameConfig): string[] {
  switch (config.kind) {
    case 'flip_reveal':
      return validateFlipReveal(config);
    case 'match_pairs':
      return validateMatchPairs(config);
    case 'sort_buckets':
      return validateSortBuckets(config);
    case 'scenario_cards':
      return validateScenarioCards(config);
  }
}
