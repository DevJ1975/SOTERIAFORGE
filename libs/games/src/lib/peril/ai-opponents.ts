/**
 * Novice AI opponents for PERIL! — pure logic (timers only), no Phaser.
 *
 * Design goals: the human should reliably win with decent play. Bots buzz
 * slowly (1.0-3.0s), skip ~35% of clues, and answer correctly only 40-55%
 * of the time, with per-bot accuracy fixed at game start.
 */

import {
  ClueContext,
  OpponentAvatar,
  OpponentEvent,
  OpponentEventListener,
  OpponentProfile,
  OpponentProvider,
  Unsubscribe,
} from './opponent-provider';

export interface AiBotConfig {
  /** Probability of answering correctly when attempting (fixed per game). */
  accuracy: number;
  /** Probability the bot tries to buzz on any given clue. */
  attemptRate: number;
  /** Buzz latency range after the window opens, in ms. */
  buzzDelayRangeMs: [number, number];
  /** Simulated "thinking" time before committing an answer, in ms. */
  thinkRangeMs: [number, number];
}

export const AI_ACCURACY_BAND: [number, number] = [0.4, 0.55];
export const AI_ATTEMPT_RATE = 0.65;
export const AI_BUZZ_DELAY_RANGE_MS: [number, number] = [1000, 3000];
export const AI_THINK_RANGE_MS: [number, number] = [900, 2200];
export const AI_MIN_DAILY_DOUBLE_WAGER = 100;

/**
 * One novice bot. All decision methods are pure rolls against the injected
 * rng so they can be statistically tested without timers.
 */
export class AiOpponentBot {
  constructor(
    readonly profile: OpponentProfile,
    readonly config: AiBotConfig,
    private readonly rng: () => number = Math.random,
  ) {}

  /** Does the bot go for the buzzer on this clue? (~65% of clues it "knows"). */
  willAttempt(): boolean {
    return this.rng() < this.config.attemptRate;
  }

  /** Buzz latency, uniform within the configured range. */
  rollBuzzDelay(): number {
    const [min, max] = this.config.buzzDelayRangeMs;
    return min + this.rng() * (max - min);
  }

  /** Thinking time before locking in an answer. */
  rollThinkTime(): number {
    const [min, max] = this.config.thinkRangeMs;
    return min + this.rng() * (max - min);
  }

  /**
   * Picks an option index: correct with p = accuracy, otherwise a plausible
   * distractor (never accidentally the correct one).
   */
  chooseOption(correctIndex: number, optionCount: number): number {
    if (this.rng() < this.config.accuracy) return correctIndex;
    const wrongSlot = Math.floor(this.rng() * (optionCount - 1));
    return wrongSlot >= correctIndex ? wrongSlot + 1 : wrongSlot;
  }

  /**
   * Daily Double wager: 30-60% of score, minimum $100, never above the
   * allowed ceiling of max(score, round top value).
   */
  rollDailyDoubleWager(score: number, roundTopValue: number): number {
    const fraction = 0.3 + this.rng() * 0.3;
    const raw = Math.max(AI_MIN_DAILY_DOUBLE_WAGER, Math.round((score * fraction) / 100) * 100);
    const ceiling = Math.max(score, roundTopValue);
    return Math.max(5, Math.min(raw, ceiling));
  }

  /** Final PERIL! wager: roughly half the score (45-55%), never negative. */
  rollFinalWager(score: number): number {
    if (score <= 0) return 0;
    const fraction = 0.45 + this.rng() * 0.1;
    return Math.min(score, Math.max(0, Math.round((score * fraction) / 100) * 100));
  }
}

function avatar(
  faceColor: number,
  shirtColor: number,
  hairStyle: number,
  hairColor: number,
  glasses: boolean,
): OpponentAvatar {
  return { faceColor, shirtColor, hairStyle, hairColor, glasses };
}

/**
 * Builds the two house bots with per-game accuracies inside the 40-55% band;
 * the second bot is always slightly better than the first.
 */
export function createHouseBots(rng: () => number = Math.random): AiOpponentBot[] {
  const [lo, hi] = AI_ACCURACY_BAND;
  const base = lo + rng() * (hi - lo - 0.07); // leaves headroom for the bump
  const better = Math.min(hi, base + 0.05 + rng() * 0.02);
  const shared = {
    attemptRate: AI_ATTEMPT_RATE,
    buzzDelayRangeMs: AI_BUZZ_DELAY_RANGE_MS,
    thinkRangeMs: AI_THINK_RANGE_MS,
  };
  return [
    new AiOpponentBot(
      {
        id: 'ai-rookie-rachel',
        name: 'Rookie Rachel',
        avatar: avatar(0xf2c9a0, 0xe05c4b, 1, 0x6b3b1f, false),
      },
      { ...shared, accuracy: base },
      rng,
    ),
    new AiOpponentBot(
      {
        id: 'ai-cautious-carl',
        name: 'Cautious Carl',
        avatar: avatar(0xd9a06b, 0x2f7d4f, 2, 0x2b2b2b, true),
      },
      { ...shared, accuracy: better },
      rng,
    ),
  ];
}

/**
 * Fully local OpponentProvider backed by the house bots. Scans the lobby
 * (finding no humans — that arrives with Phase 4), then seats the AI.
 */
export class AiOpponentProvider implements OpponentProvider {
  readonly bots: AiOpponentBot[];

  private listeners = new Set<OpponentEventListener>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private buzzersOpen = false;

  constructor(rng: () => number = Math.random) {
    this.bots = createHouseBots(rng);
  }

  joinLobby(scanMs: number): Promise<OpponentProfile[]> {
    // No humans on the floor yet — after the scan, the house bots sit in.
    return new Promise((resolve) => {
      const timer = setTimeout(
        () => {
          this.timers.delete(timer);
          resolve(this.bots.map((b) => b.profile));
        },
        Math.max(0, scanMs),
      );
      this.timers.add(timer);
    });
  }

  subscribe(listener: OpponentEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  openBuzzers(ctx: ClueContext): void {
    this.buzzersOpen = true;
    for (const bot of this.bots) {
      if (ctx.lockedOutIds.includes(bot.profile.id)) continue;
      if (!bot.willAttempt()) continue;
      const latencyMs = bot.rollBuzzDelay();
      this.schedule(latencyMs, () => {
        if (!this.buzzersOpen) return;
        this.emit({ type: 'buzz', opponentId: bot.profile.id, latencyMs });
      });
    }
  }

  closeBuzzers(): void {
    this.buzzersOpen = false;
  }

  requestAnswer(opponentId: string, ctx: ClueContext): void {
    const bot = this.bot(opponentId);
    const thinkMs = bot.rollThinkTime();
    const optionIndex = bot.chooseOption(ctx.correctOptionIndex, ctx.optionCount);
    this.schedule(thinkMs, () => this.emit({ type: 'answer', opponentId, optionIndex, thinkMs }));
  }

  requestWager(
    opponentId: string,
    kind: 'daily-double' | 'final',
    score: number,
    roundTopValue: number,
  ): void {
    const bot = this.bot(opponentId);
    const amount =
      kind === 'daily-double'
        ? bot.rollDailyDoubleWager(score, roundTopValue)
        : bot.rollFinalWager(score);
    this.schedule(700 + bot.rollThinkTime() / 2, () =>
      this.emit({ type: 'wager', opponentId, kind, amount }),
    );
  }

  cancelPending(): void {
    this.buzzersOpen = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  leave(): void {
    this.cancelPending();
    this.listeners.clear();
  }

  private bot(id: string): AiOpponentBot {
    const bot = this.bots.find((b) => b.profile.id === id);
    if (!bot) throw new Error(`Unknown AI opponent: ${id}`);
    return bot;
  }

  private schedule(delayMs: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, delayMs);
    this.timers.add(timer);
  }

  private emit(event: OpponentEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
