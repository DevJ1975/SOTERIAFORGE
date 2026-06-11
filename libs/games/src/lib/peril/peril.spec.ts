/**
 * PERIL! Jest tests — pure logic only.
 * Deliberately does NOT import phaser, the scenes, audio, or the component.
 */

import {
  buildClueOptions,
  FINAL_PERIL,
  PerilCategory,
  ROUND_ONE_CATEGORIES,
  ROUND_ONE_VALUES,
  ROUND_TWO_CATEGORIES,
  ROUND_TWO_VALUES,
} from './peril-data';
import {
  BuzzerWindow,
  createSeededRng,
  EARLY_BUZZ_LOCKOUT_MS,
  formatMoney,
  MIN_DAILY_DOUBLE_WAGER,
  PerilEngine,
} from './game-rules';
import {
  AI_ACCURACY_BAND,
  AI_BUZZ_DELAY_RANGE_MS,
  AiOpponentBot,
  AiOpponentProvider,
  createHouseBots,
} from './ai-opponents';
import { OpponentEvent, OpponentProvider } from './opponent-provider';
import { FirestoreMatchProvider } from './firestore-match-provider';

const SEATS = [
  { id: 'human', name: 'You', isHuman: true },
  { id: 'bot-a', name: 'Rookie Rachel', isHuman: false },
  { id: 'bot-b', name: 'Cautious Carl', isHuman: false },
];

function newEngine(seed = 42): PerilEngine {
  return new PerilEngine(SEATS, createSeededRng(seed));
}

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe('peril-data', () => {
  const boards: Array<{ categories: PerilCategory[]; values: readonly number[] }> = [
    { categories: ROUND_ONE_CATEGORIES, values: ROUND_ONE_VALUES },
    { categories: ROUND_TWO_CATEGORIES, values: ROUND_TWO_VALUES },
  ];

  it('has 12 board categories (6 per round)', () => {
    expect(ROUND_ONE_CATEGORIES).toHaveLength(6);
    expect(ROUND_TWO_CATEGORIES).toHaveLength(6);
  });

  it('has exactly 5 clues in every category', () => {
    for (const { categories } of boards) {
      for (const category of categories) {
        expect(category.clues).toHaveLength(5);
      }
    }
  });

  it('has exactly one Final PERIL! clue with a category', () => {
    expect(FINAL_PERIL.category.length).toBeGreaterThan(0);
    expect(FINAL_PERIL.clue.clue.length).toBeGreaterThan(0);
    expect(Array.isArray(FINAL_PERIL.clue.distractors)).toBe(true);
  });

  it('contains 61 clues total with unique clue texts', () => {
    const texts = boards
      .flatMap(({ categories }) => categories.flatMap((c) => c.clues.map((q) => q.clue)))
      .concat(FINAL_PERIL.clue.clue);
    expect(texts).toHaveLength(61);
    expect(new Set(texts).size).toBe(61);
  });

  it('gives every clue 4 distinct options that include the correct response', () => {
    const allClues = boards
      .flatMap(({ categories }) => categories.flatMap((c) => c.clues))
      .concat(FINAL_PERIL.clue);
    for (const clue of allClues) {
      expect(clue.distractors).toHaveLength(3);
      const options = [clue.correctResponse, ...clue.distractors];
      expect(new Set(options).size).toBe(4);
      expect(options).toContain(clue.correctResponse);
    }
  });

  it('phrases every option in the form of a question', () => {
    const allClues = boards
      .flatMap(({ categories }) => categories.flatMap((c) => c.clues))
      .concat(FINAL_PERIL.clue);
    for (const clue of allClues) {
      for (const option of [clue.correctResponse, ...clue.distractors]) {
        expect(option).toMatch(/^(What|Who|Where|When|Why|How)\b/);
        expect(option.endsWith('?')).toBe(true);
      }
    }
  });

  it('matches every clue value to its round tier, top to bottom', () => {
    for (const { categories, values } of boards) {
      for (const category of categories) {
        expect(category.clues.map((c) => c.value)).toEqual([...values]);
      }
    }
  });

  it('shuffles options deterministically and tracks the correct index', () => {
    const rng = createSeededRng(7);
    const clue = ROUND_ONE_CATEGORIES[0].clues[0];
    const { options, correctIndex } = buildClueOptions(clue, rng);
    expect(options).toHaveLength(4);
    expect(options[correctIndex]).toBe(clue.correctResponse);
    expect([...options].sort()).toEqual([clue.correctResponse, ...clue.distractors].sort());
  });
});

// ---------------------------------------------------------------------------
// Game rules
// ---------------------------------------------------------------------------

describe('PerilEngine scoring and control', () => {
  it('adds the value and passes board control on a correct response', () => {
    const engine = newEngine();
    engine.controlId = 'human';
    expect(engine.applyCorrect('bot-a', 600)).toBe(600);
    expect(engine.score('bot-a')).toBe(600);
    expect(engine.controlId).toBe('bot-a');
  });

  it('deducts the value and keeps control on a wrong response (can go negative)', () => {
    const engine = newEngine();
    engine.controlId = 'human';
    expect(engine.applyWrong('bot-b', 800)).toBe(-800);
    expect(engine.score('bot-b')).toBe(-800);
    expect(engine.controlId).toBe('human');
  });

  it('gives the trailing contestant first selection in DOUBLE PERIL!', () => {
    const engine = newEngine();
    engine.applyCorrect('human', 1000);
    engine.applyWrong('bot-b', 600);
    engine.startRound('round2');
    expect(engine.controlId).toBe('bot-b');
    expect(engine.roundTopValue).toBe(2000);
  });

  it('progresses round1 -> round2 -> final', () => {
    const engine = newEngine();
    expect(engine.nextRound()).toBe('round2');
    engine.startRound('round2');
    expect(engine.nextRound()).toBe('final');
  });

  it('tracks cell usage to round completion', () => {
    const engine = newEngine();
    expect(engine.isRoundComplete()).toBe(false);
    for (const ref of engine.availableCells()) engine.markUsed(ref);
    expect(engine.isRoundComplete()).toBe(true);
    expect(engine.availableCells()).toHaveLength(0);
  });

  it('hides one Daily Double in round 1 and two (distinct categories) in round 2, never in the top row', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const engine = new PerilEngine(SEATS, createSeededRng(seed));
      const find = () => {
        const dd: Array<{ cat: number; row: number }> = [];
        for (let cat = 0; cat < 6; cat++) {
          for (let row = 0; row < 5; row++) {
            if (engine.getCell({ categoryIndex: cat, clueIndex: row }).isDailyDouble) {
              dd.push({ cat, row });
            }
          }
        }
        return dd;
      };
      const r1 = find();
      expect(r1).toHaveLength(1);
      expect(r1[0].row).toBeGreaterThan(0);
      engine.startRound('round2');
      const r2 = find();
      expect(r2).toHaveLength(2);
      expect(r2[0].cat).not.toBe(r2[1].cat);
      for (const dd of r2) expect(dd.row).toBeGreaterThan(0);
    }
  });
});

describe('Daily Double wager bounds', () => {
  it('allows $5 up to the round top value when the score is low', () => {
    const engine = newEngine();
    engine.applyCorrect('human', 200); // score 200 < top 1000
    expect(engine.dailyDoubleWagerBounds('human')).toEqual({
      min: MIN_DAILY_DOUBLE_WAGER,
      max: 1000,
    });
    expect(engine.isValidDailyDoubleWager('human', 5)).toBe(true);
    expect(engine.isValidDailyDoubleWager('human', 4)).toBe(false);
    expect(engine.isValidDailyDoubleWager('human', 1000)).toBe(true);
    expect(engine.isValidDailyDoubleWager('human', 1001)).toBe(false);
  });

  it('allows a true Daily Double up to the full score when the score exceeds the top value', () => {
    const engine = newEngine();
    engine.applyCorrect('human', 4600);
    expect(engine.dailyDoubleWagerBounds('human').max).toBe(4600);
    expect(engine.isValidDailyDoubleWager('human', 4600)).toBe(true);
    expect(engine.isValidDailyDoubleWager('human', 4601)).toBe(false);
    expect(engine.clampDailyDoubleWager('human', 99999)).toBe(4600);
    expect(engine.clampDailyDoubleWager('human', -50)).toBe(MIN_DAILY_DOUBLE_WAGER);
  });
});

describe('Final PERIL! wager bounds', () => {
  it('allows 0 through the full positive score', () => {
    const engine = newEngine();
    engine.applyCorrect('human', 3200);
    expect(engine.isValidFinalWager('human', 0)).toBe(true);
    expect(engine.isValidFinalWager('human', 3200)).toBe(true);
    expect(engine.isValidFinalWager('human', 3201)).toBe(false);
    expect(engine.isValidFinalWager('human', -1)).toBe(false);
    expect(engine.clampFinalWager('human', 99999)).toBe(3200);
  });

  it('excludes non-positive scores from Final PERIL!', () => {
    const engine = newEngine();
    engine.applyCorrect('human', 500);
    engine.applyWrong('bot-a', 400);
    expect(engine.isValidFinalWager('bot-a', 0)).toBe(false);
    expect(engine.finalists().map((c) => c.id)).toEqual(['human']);
  });
});

describe('BuzzerWindow (authentic lockout rules)', () => {
  it('locks an early buzzer out for 250ms', () => {
    const buzzer = new BuzzerWindow();
    buzzer.arm();
    expect(buzzer.attempt('human', 1000)).toBe('too-early');
    buzzer.open();
    expect(buzzer.attempt('human', 1000 + EARLY_BUZZ_LOCKOUT_MS - 1)).toBe('locked-out');
    expect(buzzer.attempt('human', 1000 + EARLY_BUZZ_LOCKOUT_MS)).toBe('win');
    expect(buzzer.winnerId).toBe('human');
  });

  it('awards the window to the first valid buzz only', () => {
    const buzzer = new BuzzerWindow();
    buzzer.arm();
    buzzer.open();
    expect(buzzer.attempt('bot-a', 2000)).toBe('win');
    expect(buzzer.attempt('human', 2001)).toBe('already-won');
  });

  it('excludes wrong answerers on reopen but lets others buzz again', () => {
    const buzzer = new BuzzerWindow();
    buzzer.arm();
    buzzer.open();
    expect(buzzer.attempt('bot-a', 100)).toBe('win');
    buzzer.exclude('bot-a');
    buzzer.reopen();
    expect(buzzer.attempt('bot-a', 300)).toBe('excluded');
    expect(buzzer.attempt('human', 320)).toBe('win');
  });

  it('rearming clears winner, lockouts, and exclusions', () => {
    const buzzer = new BuzzerWindow();
    buzzer.arm();
    buzzer.open();
    buzzer.attempt('human', 10);
    buzzer.exclude('human');
    buzzer.arm();
    buzzer.open();
    expect(buzzer.attempt('human', 20)).toBe('win');
  });
});

describe('formatMoney', () => {
  it('formats negatives with a leading minus', () => {
    expect(formatMoney(1200)).toBe('$1,200');
    expect(formatMoney(-400)).toBe('-$400');
  });
});

// ---------------------------------------------------------------------------
// AI statistical bounds
// ---------------------------------------------------------------------------

describe('AI opponents', () => {
  const config = {
    accuracy: 0.5,
    attemptRate: 0.65,
    buzzDelayRangeMs: AI_BUZZ_DELAY_RANGE_MS,
    thinkRangeMs: [900, 2200] as [number, number],
  };
  const profile = {
    id: 'bot-test',
    name: 'Test Bot',
    avatar: { faceColor: 0, shirtColor: 0, hairStyle: 0, hairColor: 0, glasses: false },
  };

  it('answers within the configured accuracy band over 500 simulated answers', () => {
    const bot = new AiOpponentBot(profile, config, createSeededRng(1234));
    let correct = 0;
    for (let i = 0; i < 500; i++) {
      if (bot.chooseOption(2, 4) === 2) correct++;
    }
    const rate = correct / 500;
    expect(rate).toBeGreaterThanOrEqual(0.42);
    expect(rate).toBeLessThanOrEqual(0.58);
  });

  it('never picks the correct option when the accuracy roll fails', () => {
    const alwaysWrong = new AiOpponentBot(profile, { ...config, accuracy: 0 }, createSeededRng(99));
    for (let i = 0; i < 200; i++) {
      const pick = alwaysWrong.chooseOption(1, 4);
      expect(pick).not.toBe(1);
      expect(pick).toBeGreaterThanOrEqual(0);
      expect(pick).toBeLessThan(4);
    }
  });

  it('keeps buzz delays inside the 1.0-3.0s window over 500 rolls', () => {
    const bot = new AiOpponentBot(profile, config, createSeededRng(77));
    for (let i = 0; i < 500; i++) {
      const delay = bot.rollBuzzDelay();
      expect(delay).toBeGreaterThanOrEqual(AI_BUZZ_DELAY_RANGE_MS[0]);
      expect(delay).toBeLessThanOrEqual(AI_BUZZ_DELAY_RANGE_MS[1]);
    }
  });

  it('attempts roughly 65% of clues', () => {
    const bot = new AiOpponentBot(profile, config, createSeededRng(31));
    let attempts = 0;
    for (let i = 0; i < 1000; i++) if (bot.willAttempt()) attempts++;
    expect(attempts / 1000).toBeGreaterThanOrEqual(0.58);
    expect(attempts / 1000).toBeLessThanOrEqual(0.72);
  });

  it('wagers 30-60% of score (min $100) on Daily Doubles, within the legal ceiling', () => {
    const bot = new AiOpponentBot(profile, config, createSeededRng(5));
    for (let i = 0; i < 200; i++) {
      const wager = bot.rollDailyDoubleWager(2000, 1000);
      expect(wager).toBeGreaterThanOrEqual(Math.round((2000 * 0.3) / 100) * 100 - 100);
      expect(wager).toBeLessThanOrEqual(Math.round((2000 * 0.6) / 100) * 100 + 100);
      expect(wager).toBeGreaterThanOrEqual(100);
      expect(wager).toBeLessThanOrEqual(2000);
    }
    // Tiny scores still wager at least $100 but never above the ceiling.
    expect(bot.rollDailyDoubleWager(40, 1000)).toBeGreaterThanOrEqual(100);
    expect(bot.rollDailyDoubleWager(40, 1000)).toBeLessThanOrEqual(1000);
  });

  it('wagers roughly half its score in Final PERIL!', () => {
    const bot = new AiOpponentBot(profile, config, createSeededRng(8));
    for (let i = 0; i < 200; i++) {
      const wager = bot.rollFinalWager(4000);
      expect(wager).toBeGreaterThanOrEqual(4000 * 0.45 - 100);
      expect(wager).toBeLessThanOrEqual(4000 * 0.55 + 100);
    }
    expect(bot.rollFinalWager(0)).toBe(0);
    expect(bot.rollFinalWager(-500)).toBe(0);
  });

  it('fixes per-bot accuracy inside the 40-55% band, second bot slightly better', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const [rachel, carl] = createHouseBots(createSeededRng(seed));
      const [lo, hi] = AI_ACCURACY_BAND;
      expect(rachel.config.accuracy).toBeGreaterThanOrEqual(lo);
      expect(rachel.config.accuracy).toBeLessThanOrEqual(hi);
      expect(carl.config.accuracy).toBeGreaterThanOrEqual(lo);
      expect(carl.config.accuracy).toBeLessThanOrEqual(hi);
      expect(carl.config.accuracy).toBeGreaterThan(rachel.config.accuracy);
    }
  });

  it('has personality names and procedural avatars', () => {
    const [rachel, carl] = createHouseBots(createSeededRng(3));
    expect(rachel.profile.name).toBe('Rookie Rachel');
    expect(carl.profile.name).toBe('Cautious Carl');
    expect(carl.profile.avatar.glasses).toBe(true);
  });
});

describe('AiOpponentProvider', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('seats the two house bots after the lobby scan finds no humans', async () => {
    const provider = new AiOpponentProvider(createSeededRng(11));
    const promise = provider.joinLobby(4000);
    jest.advanceTimersByTime(4000);
    const opponents = await promise;
    expect(opponents.map((o) => o.name)).toEqual(['Rookie Rachel', 'Cautious Carl']);
    provider.leave();
  });

  it('emits buzz events with latency inside the configured window', () => {
    const provider = new AiOpponentProvider(createSeededRng(13));
    const events: OpponentEvent[] = [];
    provider.subscribe((e) => events.push(e));
    provider.openBuzzers({
      value: 600,
      roundTopValue: 1000,
      optionCount: 4,
      correctOptionIndex: 0,
      lockedOutIds: [],
    });
    jest.advanceTimersByTime(AI_BUZZ_DELAY_RANGE_MS[1] + 1);
    for (const e of events) {
      expect(e.type).toBe('buzz');
      if (e.type === 'buzz') {
        expect(e.latencyMs).toBeGreaterThanOrEqual(AI_BUZZ_DELAY_RANGE_MS[0]);
        expect(e.latencyMs).toBeLessThanOrEqual(AI_BUZZ_DELAY_RANGE_MS[1]);
      }
    }
    provider.leave();
  });

  it('stops emitting once the buzzers close', () => {
    const provider = new AiOpponentProvider(createSeededRng(17));
    const events: OpponentEvent[] = [];
    provider.subscribe((e) => events.push(e));
    provider.openBuzzers({
      value: 600,
      roundTopValue: 1000,
      optionCount: 4,
      correctOptionIndex: 0,
      lockedOutIds: [],
    });
    provider.closeBuzzers();
    jest.advanceTimersByTime(5000);
    expect(events).toHaveLength(0);
    provider.leave();
  });

  it('answers a requested clue with a valid option index', () => {
    const provider = new AiOpponentProvider(createSeededRng(19));
    const events: OpponentEvent[] = [];
    provider.subscribe((e) => events.push(e));
    provider.requestAnswer('ai-rookie-rachel', {
      value: 800,
      roundTopValue: 1000,
      optionCount: 4,
      correctOptionIndex: 2,
      lockedOutIds: [],
    });
    jest.advanceTimersByTime(3000);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.type).toBe('answer');
    if (e.type === 'answer') {
      expect(e.optionIndex).toBeGreaterThanOrEqual(0);
      expect(e.optionIndex).toBeLessThan(4);
    }
    provider.leave();
  });
});

// ---------------------------------------------------------------------------
// Firestore realtime provider (Phase 4) — signed-out degradation.
// The full protocol suite lives in firestore-match-provider.spec.ts.
// ---------------------------------------------------------------------------

describe('FirestoreMatchProvider (signed out / no Firestore)', () => {
  it('resolves joinLobby immediately with zero opponents (the AI path) and never throws', async () => {
    const provider = new FirestoreMatchProvider();
    await expect(provider.joinLobby(4000)).resolves.toEqual([]);
  });

  it('tolerates every realtime method without a match', () => {
    // Typed as the scene-facing interface, exactly as the scenes consume it.
    const provider: OpponentProvider = new FirestoreMatchProvider();
    expect(provider.isRealtime).toBe(true);
    const unsubscribe = provider.subscribe(() => undefined);
    const ctx = {
      value: 0,
      roundTopValue: 0,
      optionCount: 4,
      correctOptionIndex: 0,
      lockedOutIds: [],
    };
    expect(() => provider.openBuzzers(ctx)).not.toThrow();
    expect(() => provider.closeBuzzers()).not.toThrow();
    expect(() => provider.requestAnswer('x', ctx)).not.toThrow();
    expect(() => provider.requestWager('x', 'final', 0, 0)).not.toThrow();
    expect(() => provider.sendLocalBuzz?.(120)).not.toThrow();
    expect(() => provider.sendLocalAnswer?.(1, 800)).not.toThrow();
    expect(() => provider.sendLocalWager?.('final', 100)).not.toThrow();
    expect(() => provider.sendLocalSelect?.(0, 0)).not.toThrow();
    expect(() => provider.publishState?.({ phase: 'board' })).not.toThrow();
    expect(() => provider.markStarted?.()).not.toThrow();
    expect(() => provider.completeMatch?.()).not.toThrow();
    expect(() => provider.cancelPending()).not.toThrow();
    unsubscribe();
    expect(() => provider.leave()).not.toThrow();
  });
});
