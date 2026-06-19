/**
 * PERIL! game rules — pure logic, no Phaser imports (Jest/jsdom friendly).
 *
 * Covers the board/turn state machine, scoring, buzzer lockouts, control
 * passing, Daily Double + Final wager validation, and round progression.
 */

import {
  DEFAULT_BOARD,
  FinalPeril,
  PerilBoard,
  PerilCategory,
  PerilClue,
  ROUND_ONE_VALUES,
  ROUND_TWO_VALUES,
  RoundId,
} from './peril-data';

/** Authentic rule: buzzing before the buzzer opens locks you out for 250ms. */
export const EARLY_BUZZ_LOCKOUT_MS = 250;
/** Think window for buzzing / answering once a clue is fully revealed. */
export const THINK_WINDOW_MS = 8000;
/** Minimum Daily Double wager. */
export const MIN_DAILY_DOUBLE_WAGER = 5;

/** Deterministic seeded RNG (mulberry32). Returns values in [0, 1). */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ContestantSeat {
  id: string;
  name: string;
  isHuman: boolean;
}

export interface ContestantState extends ContestantSeat {
  score: number;
}

export interface CellRef {
  categoryIndex: number;
  clueIndex: number;
}

export interface BoardCell {
  value: number;
  used: boolean;
  isDailyDouble: boolean;
}

export interface WagerBounds {
  min: number;
  max: number;
}

export class PerilEngine {
  readonly contestants: ContestantState[];
  /** The clue board in play (OSHA by default; aviation via ?board=airport). */
  readonly board: PerilBoard;
  round: Exclude<RoundId, 'final'> = 'round1';
  /** Contestant id currently in control of the board. */
  controlId: string;
  /** Number of Daily Doubles found so far this round (for UI counters). */
  dailyDoublesFound = 0;

  private cells: BoardCell[][] = [];
  private readonly rng: () => number;

  constructor(
    seats: ContestantSeat[],
    rng: () => number = Math.random,
    board: PerilBoard = DEFAULT_BOARD,
  ) {
    if (seats.length < 2) {
      throw new Error('PERIL! needs at least two contestants.');
    }
    this.contestants = seats.map((s) => ({ ...s, score: 0 }));
    this.controlId = this.contestants[0].id;
    this.rng = rng;
    this.board = board;
    this.startRound('round1');
  }

  // ---- Round / board ------------------------------------------------------

  startRound(round: Exclude<RoundId, 'final'>): void {
    this.round = round;
    this.dailyDoublesFound = 0;
    const values = round === 'round1' ? ROUND_ONE_VALUES : ROUND_TWO_VALUES;
    const categories = this.categoriesForRound(round);
    this.cells = categories.map(() =>
      values.map((value) => ({ value, used: false, isDailyDouble: false })),
    );
    this.placeDailyDoubles(round === 'round1' ? 1 : 2);
    if (round === 'round2') {
      // Authentic rule: trailing contestant selects first in Double PERIL!.
      this.controlId = this.trailingContestant().id;
    }
  }

  categoriesForRound(round: Exclude<RoundId, 'final'>): PerilCategory[] {
    return round === 'round1' ? this.board.roundOne : this.board.roundTwo;
  }

  get roundTopValue(): number {
    return this.round === 'round1'
      ? ROUND_ONE_VALUES[ROUND_ONE_VALUES.length - 1]
      : ROUND_TWO_VALUES[ROUND_TWO_VALUES.length - 1];
  }

  get roundValues(): readonly number[] {
    return this.round === 'round1' ? ROUND_ONE_VALUES : ROUND_TWO_VALUES;
  }

  getCell(ref: CellRef): BoardCell {
    return this.cells[ref.categoryIndex][ref.clueIndex];
  }

  getClue(ref: CellRef): PerilClue {
    return this.categoriesForRound(this.round)[ref.categoryIndex].clues[ref.clueIndex];
  }

  isCellAvailable(ref: CellRef): boolean {
    return !this.getCell(ref).used;
  }

  availableCells(): CellRef[] {
    const refs: CellRef[] = [];
    this.cells.forEach((column, categoryIndex) =>
      column.forEach((cell, clueIndex) => {
        if (!cell.used) refs.push({ categoryIndex, clueIndex });
      }),
    );
    return refs;
  }

  markUsed(ref: CellRef): void {
    this.getCell(ref).used = true;
  }

  isRoundComplete(): boolean {
    return this.availableCells().length === 0;
  }

  /** Round after the current one: round1 -> round2 -> final. */
  nextRound(): RoundId {
    return this.round === 'round1' ? 'round2' : 'final';
  }

  // ---- Contestants / scoring ----------------------------------------------

  contestant(id: string): ContestantState {
    const found = this.contestants.find((c) => c.id === id);
    if (!found) throw new Error(`Unknown contestant: ${id}`);
    return found;
  }

  score(id: string): number {
    return this.contestant(id).score;
  }

  /** Correct response: add value and hand board control to the responder. */
  applyCorrect(id: string, amount: number): number {
    const c = this.contestant(id);
    c.score += amount;
    this.controlId = id;
    return c.score;
  }

  /** Wrong response: deduct value; board control is unchanged. */
  applyWrong(id: string, amount: number): number {
    const c = this.contestant(id);
    c.score -= amount;
    return c.score;
  }

  leader(): ContestantState {
    return this.contestants.reduce((a, b) => (b.score > a.score ? b : a));
  }

  trailingContestant(): ContestantState {
    return this.contestants.reduce((a, b) => (b.score < a.score ? b : a));
  }

  /** Contestants eligible for Final PERIL! (positive score only). */
  finalists(): ContestantState[] {
    return this.contestants.filter((c) => c.score > 0);
  }

  // ---- Wagers ---------------------------------------------------------------

  /**
   * Daily Double: wager from $5 up to the greater of the contestant's score
   * and the round's top clue value ("true Daily Double" allowed).
   */
  dailyDoubleWagerBounds(id: string): WagerBounds {
    const score = this.score(id);
    return { min: MIN_DAILY_DOUBLE_WAGER, max: Math.max(score, this.roundTopValue) };
  }

  isValidDailyDoubleWager(id: string, wager: number): boolean {
    const { min, max } = this.dailyDoubleWagerBounds(id);
    return Number.isInteger(wager) && wager >= min && wager <= max;
  }

  clampDailyDoubleWager(id: string, wager: number): number {
    const { min, max } = this.dailyDoubleWagerBounds(id);
    return Math.min(max, Math.max(min, Math.round(wager)));
  }

  /** Final PERIL!: 0 up to the contestant's full (positive) score. */
  finalWagerBounds(id: string): WagerBounds {
    return { min: 0, max: Math.max(0, this.score(id)) };
  }

  isValidFinalWager(id: string, wager: number): boolean {
    if (this.score(id) <= 0) return false;
    const { min, max } = this.finalWagerBounds(id);
    return Number.isInteger(wager) && wager >= min && wager <= max;
  }

  clampFinalWager(id: string, wager: number): number {
    const { min, max } = this.finalWagerBounds(id);
    return Math.min(max, Math.max(min, Math.round(wager)));
  }

  finalPeril(): FinalPeril {
    return this.board.final;
  }

  finalClue(): PerilClue {
    return this.board.final.clue;
  }

  finalCategory(): string {
    return this.board.final.category;
  }

  // ---- Internals -------------------------------------------------------------

  private placeDailyDoubles(count: number): void {
    const categoryIndices = this.cells.map((_, i) => i);
    for (let i = categoryIndices.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [categoryIndices[i], categoryIndices[j]] = [categoryIndices[j], categoryIndices[i]];
    }
    for (let n = 0; n < count; n++) {
      const categoryIndex = categoryIndices[n]; // distinct categories
      // Authentic flavor: Daily Doubles never hide in the top (cheapest) row.
      const clueIndex = 1 + Math.floor(this.rng() * (this.cells[categoryIndex].length - 1));
      this.cells[categoryIndex][clueIndex].isDailyDouble = true;
    }
  }
}

// ---- Buzzer ------------------------------------------------------------------

export type BuzzResult =
  | 'win' // first valid buzz — you have the board
  | 'too-early' // buzzed before the window opened: 250ms lockout
  | 'locked-out' // still serving an early-buzz lockout
  | 'excluded' // already answered this clue wrong
  | 'closed' // buzzer not open (no penalty; window not armed)
  | 'already-won'; // somebody beat you to it

/**
 * Authentic buzzer window. Arm it when a clue starts, open it when the clue
 * is fully revealed. Early buzzes lock the contestant out for 250ms.
 */
export class BuzzerWindow {
  private phase: 'armed' | 'open' | 'won' | 'idle' = 'idle';
  private lockoutUntil = new Map<string, number>();
  private excluded = new Set<string>();
  winnerId: string | null = null;

  /** Prepare for a new clue (clears lockouts, exclusions, winner). */
  arm(): void {
    this.phase = 'armed';
    this.lockoutUntil.clear();
    this.excluded.clear();
    this.winnerId = null;
  }

  /** Open buzzing (clue fully revealed). */
  open(): void {
    if (this.phase === 'armed' || this.phase === 'idle') this.phase = 'open';
  }

  /** Re-open after a wrong answer; the wrong responder must be excluded first. */
  reopen(): void {
    this.winnerId = null;
    this.phase = 'open';
  }

  /** Lock a contestant out of the rest of this clue (wrong answer). */
  exclude(id: string): void {
    this.excluded.add(id);
  }

  isExcluded(id: string): boolean {
    return this.excluded.has(id);
  }

  get isOpen(): boolean {
    return this.phase === 'open';
  }

  /** Attempt a buzz at timestamp `now` (ms). */
  attempt(id: string, now: number): BuzzResult {
    if (this.excluded.has(id)) return 'excluded';
    if (this.phase === 'won') return 'already-won';
    if (this.phase === 'armed') {
      // Early buzz: authentic 250ms lockout.
      this.lockoutUntil.set(id, now + EARLY_BUZZ_LOCKOUT_MS);
      return 'too-early';
    }
    if (this.phase !== 'open') return 'closed';
    const until = this.lockoutUntil.get(id);
    if (until !== undefined && now < until) return 'locked-out';
    this.phase = 'won';
    this.winnerId = id;
    return 'win';
  }
}

// ---- Convenience formatting (pure) --------------------------------------------

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}$${Math.abs(amount).toLocaleString('en-US')}`;
}
