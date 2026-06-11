/**
 * Hazard Hunter — turn-based "shift" state machine.
 * Pure logic: NO imports of three/phaser/DOM so Jest (jsdom) can test it.
 */

export interface ShiftConfig {
  levelId: number;
  /** Ids of every hazard seeded in the level. */
  hazardIds: readonly string[];
  /** Inspection actions granted for this shift. */
  inspections: number;
  /** Points per hazard found. Default 250. */
  basePoints?: number;
  /** Bonus per unused inspection at shift end. Default 100. */
  unusedBonus?: number;
  /** Penalty per missed hazard at shift end. Default 150. */
  missPenalty?: number;
  /** Fraction of hazards required to unlock the next level. Default 0.7. */
  unlockRatio?: number;
}

export type InspectOutcome = 'found' | 'duplicate' | 'wrong' | 'no-inspections' | 'shift-over';

export interface InspectResult {
  outcome: InspectOutcome;
  hazardId: string | null;
  inspectionsLeft: number;
  foundCount: number;
  total: number;
  /** Running score (found points only; end-of-shift adjustments come later). */
  score: number;
  /** True when this inspection ended the shift (all found or none left). */
  shiftEnded: boolean;
}

export interface ScoreBreakdown {
  foundPoints: number;
  unusedBonus: number;
  missPenalty: number;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ShiftSummary {
  levelId: number;
  found: string[];
  missed: string[];
  foundCount: number;
  total: number;
  foundRatio: number;
  inspectionsLeft: number;
  breakdown: ScoreBreakdown;
  /** Final score, clamped at 0. */
  score: number;
  grade: Grade;
  unlockedNext: boolean;
}

export function gradeForRatio(ratio: number): Grade {
  if (ratio >= 0.95) return 'A';
  if (ratio >= 0.8) return 'B';
  if (ratio >= 0.7) return 'C';
  if (ratio >= 0.5) return 'D';
  return 'F';
}

/**
 * One level == one shift. The player spends inspection actions; the engine
 * tracks found hazards, running score, and produces the end-of-shift summary
 * (missed-hazard incident list, breakdown, grade, unlock).
 */
export class ShiftEngine {
  readonly levelId: number;
  readonly total: number;
  readonly basePoints: number;
  readonly unusedBonus: number;
  readonly missPenalty: number;
  readonly unlockRatio: number;

  private readonly hazardIds: ReadonlySet<string>;
  private readonly foundIds = new Set<string>();
  private inspections: number;
  private ended = false;

  constructor(cfg: ShiftConfig) {
    if (cfg.inspections <= 0) {
      throw new Error('A shift needs at least one inspection action.');
    }
    if (cfg.hazardIds.length === 0) {
      throw new Error('A shift needs at least one hazard.');
    }
    this.levelId = cfg.levelId;
    this.hazardIds = new Set(cfg.hazardIds);
    if (this.hazardIds.size !== cfg.hazardIds.length) {
      throw new Error('Hazard ids must be unique.');
    }
    this.total = this.hazardIds.size;
    this.inspections = cfg.inspections;
    this.basePoints = cfg.basePoints ?? 250;
    this.unusedBonus = cfg.unusedBonus ?? 100;
    this.missPenalty = cfg.missPenalty ?? 150;
    this.unlockRatio = cfg.unlockRatio ?? 0.7;
  }

  get inspectionsLeft(): number {
    return this.inspections;
  }

  get foundCount(): number {
    return this.foundIds.size;
  }

  get foundList(): string[] {
    return [...this.foundIds];
  }

  get isEnded(): boolean {
    return this.ended;
  }

  get allFound(): boolean {
    return this.foundIds.size === this.total;
  }

  /** Running score (found hazards only). */
  get score(): number {
    return this.foundIds.size * this.basePoints;
  }

  isFound(id: string): boolean {
    return this.foundIds.has(id);
  }

  /**
   * Spend an inspection. Pass the clicked hazard id, or null for a clean
   * (non-hazard) object. Re-inspecting an already-found hazard does NOT
   * consume an action.
   */
  inspect(hazardId: string | null): InspectResult {
    if (this.ended) return this.result('shift-over', null, false);
    if (this.inspections <= 0) {
      return this.result('no-inspections', null, false);
    }

    if (hazardId !== null && this.foundIds.has(hazardId)) {
      return this.result('duplicate', hazardId, false);
    }

    this.inspections -= 1;

    let outcome: InspectOutcome = 'wrong';
    if (hazardId !== null && this.hazardIds.has(hazardId)) {
      this.foundIds.add(hazardId);
      outcome = 'found';
    }

    const shiftEnded = this.allFound || this.inspections === 0;
    if (shiftEnded) this.ended = true;
    return this.result(outcome, outcome === 'found' ? hazardId : null, shiftEnded);
  }

  /** Player voluntarily ends the shift (or the engine already ended it). */
  endShift(): ShiftSummary {
    this.ended = true;
    return this.summary();
  }

  summary(): ShiftSummary {
    const found = [...this.foundIds];
    const missed = [...this.hazardIds].filter((id) => !this.foundIds.has(id));
    const foundPoints = found.length * this.basePoints;
    const unusedBonus = this.inspections * this.unusedBonus;
    const missPenalty = missed.length * this.missPenalty;
    const score = Math.max(0, foundPoints + unusedBonus - missPenalty);
    const foundRatio = found.length / this.total;
    return {
      levelId: this.levelId,
      found,
      missed,
      foundCount: found.length,
      total: this.total,
      foundRatio,
      inspectionsLeft: this.inspections,
      breakdown: { foundPoints, unusedBonus, missPenalty },
      score,
      grade: gradeForRatio(foundRatio),
      unlockedNext: foundRatio >= this.unlockRatio,
    };
  }

  private result(
    outcome: InspectOutcome,
    hazardId: string | null,
    shiftEnded: boolean,
  ): InspectResult {
    return {
      outcome,
      hazardId,
      inspectionsLeft: this.inspections,
      foundCount: this.foundIds.size,
      total: this.total,
      score: this.score,
      shiftEnded,
    };
  }
}
