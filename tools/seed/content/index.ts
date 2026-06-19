import type { CourseDraft } from '@forge/shared';
import { buildRampApronCourse, RAMP_APRON_COURSE_ID } from './ramp-apron-safety';
import { buildJetBridgeCourse, JET_BRIDGE_COURSE_ID } from './jet-bridge-door-ops';
import { buildDeicingCourse, DEICING_COURSE_ID } from './deicing-winter-ops';
import { buildFuelingCourse, FUELING_COURSE_ID } from './fueling-fire-safety';

/**
 * One authored course plus the catalog metadata the `Course` meta doc needs.
 * The seed script writes the `Course` doc and the `content/draft` CourseDraft
 * from a single source so they never drift.
 */
export interface SeedCourse {
  /** The rich authoring content stored at courses/{id}/content/draft. */
  draft: CourseDraft;
  /** Catalog metadata for the Course meta doc. */
  meta: {
    tags: string[];
    xpReward: number;
    badgeRefs: string[];
  };
}

export const SEED_COURSES: SeedCourse[] = [
  {
    draft: buildRampApronCourse(),
    meta: {
      tags: ['ramp', 'apron', 'fod', 'gse', 'osha'],
      xpReward: 500,
      badgeRefs: ['fod-spotter', 'ramp-safety-certified'],
    },
  },
  {
    draft: buildJetBridgeCourse(),
    meta: {
      tags: ['jet-bridge', 'doors', 'fall-protection', 'ergonomics'],
      xpReward: 400,
      badgeRefs: ['ramp-safety-certified'],
    },
  },
  {
    draft: buildDeicingCourse(),
    meta: {
      tags: ['de-icing', 'winter-ops', 'glycol', 'fall-protection', 'faa'],
      xpReward: 450,
      badgeRefs: ['de-ice-pro'],
    },
  },
  {
    draft: buildFuelingCourse(),
    meta: {
      tags: ['fueling', 'fire-prevention', 'nfpa-407', 'osha'],
      xpReward: 550,
      badgeRefs: ['fuel-safety'],
    },
  },
];

export { RAMP_APRON_COURSE_ID, JET_BRIDGE_COURSE_ID, DEICING_COURSE_ID, FUELING_COURSE_ID };
export {
  SAMPLE_VIDEO_FILE,
  SAMPLE_VIDEO_MIME,
  SAMPLE_VIDEO_SIZE_BYTES,
  SEED_STORAGE_BUCKET,
  emulatorDownloadUrl,
  videoStoragePath,
} from './video-asset';
