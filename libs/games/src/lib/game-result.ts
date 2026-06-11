import { InjectionToken } from '@angular/core';

/** Outcome reported by a Safety Arcade game when a session ends. */
export interface GameResultReport {
  game: 'hazard-hunter' | 'peril';
  score: number;
  maxScore?: number;
  won?: boolean;
}

/**
 * Where finished games send their results. The learner app provides a
 * Firestore-backed implementation (gameResults collection → XP trigger);
 * when absent (signed-out, Studio preview) games skip reporting silently.
 */
export interface GameResultSink {
  report(result: GameResultReport): Promise<void>;
}

export const GAME_RESULT_SINK = new InjectionToken<GameResultSink>('forge.gameResultSink');
