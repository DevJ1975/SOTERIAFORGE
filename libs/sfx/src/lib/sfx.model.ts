/**
 * Every sound in `libs/sfx/assets`. Kept in step with `scripts/sfx/manifest.json`
 * (a spec fails if the two drift, or if a file is missing).
 */
export const SFX_IDS = [
  'correct',
  'incorrect',
  'select',
  'card-flip',
  'match',
  'lesson-complete',
  'module-complete',
  'level-up',
  'badge-earned',
  'streak',
  'timer-warning',
  'time-up',
  'notification',
  'page-turn',
  'submit',
  'error',
  'unlock',
  'pass',
  'fail',
] as const;

export type SfxId = (typeof SFX_IDS)[number];
