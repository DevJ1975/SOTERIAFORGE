import { z } from 'zod';
import { CONTENT_TYPES, PUBLISH_STATUSES } from '../constants';

/*
 * Forge API learning responses (backend/apps/learning, backend/apps/assessments): the
 * course → module → lesson model. `learning-contract.spec.ts` checks every schema here
 * against the committed OpenAPI document (`backend/openapi.json`), so a serializer change
 * that these schemas don't follow fails CI.
 *
 * Nullable fields are `.nullable()`, never optional: the API always sends the key.
 */

const uuid = z.string().uuid();
const dateTime = z.string().datetime({ offset: true });
const int = z.number().int();

export const apiCourse = z.object({
  id: uuid,
  title: z.string(),
  description: z.string(),
  status: z.enum(PUBLISH_STATUSES),
  tags: z.array(z.string()),
  availableOffline: z.boolean(),
  createdAt: dateTime,
  updatedAt: dateTime,
});
export type ApiCourse = z.infer<typeof apiCourse>;

export const apiEnrollment = z.object({
  id: uuid,
  courseId: uuid,
  memberId: uuid,
  assigned: z.boolean(),
  dueAt: dateTime.nullable(),
  progressPct: int,
  completedAt: dateTime.nullable(),
  lastActivityAt: dateTime.nullable(),
  createdAt: dateTime,
});
export type ApiEnrollment = z.infer<typeof apiEnrollment>;

export const apiLessonSummary = z.object({
  id: uuid,
  title: z.string(),
  order: int,
  contentType: z.enum(CONTENT_TYPES),
  estimatedMinutes: int.nullable(),
  frameworkTags: z.array(z.string()),
  hasQuiz: z.boolean(),
  completed: z.boolean(),
});
export type ApiLessonSummary = z.infer<typeof apiLessonSummary>;

export const apiModuleOutline = z.object({
  id: uuid,
  courseId: uuid,
  title: z.string(),
  label: z.string(),
  order: int,
  lessons: z.array(apiLessonSummary),
});
export type ApiModuleOutline = z.infer<typeof apiModuleOutline>;

export const apiCourseOutline = apiCourse.extend({
  modules: z.array(apiModuleOutline),
  enrollment: apiEnrollment.nullable(),
});
export type ApiCourseOutline = z.infer<typeof apiCourseOutline>;

/** A question as learners see it: no correct flags, answer key or feedback. */
export const apiQuestion = z.object({
  id: z.string(),
  type: z.enum(['mcq', 'multi_select', 'true_false', 'ordering', 'matching', 'fill_in']),
  prompt: z.string(),
  points: int,
  /** Choice options, or the items to put in order (shown in a stable shuffle). */
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  /** Matching only: answer with `"left:right"` strings in `selectedOptionIds`. */
  matching: z.object({ left: z.array(z.string()), right: z.array(z.string()) }).optional(),
});
export type ApiQuestion = z.infer<typeof apiQuestion>;

export const apiLessonQuiz = z.object({
  id: uuid,
  title: z.string(),
  /** `check`: one question at a time, first try recorded. `graded`: submit all at once. */
  mode: z.enum(['check', 'graded']),
  passThreshold: int,
  maxAttempts: int.nullable(),
  questions: z.array(apiQuestion),
  answered: z.record(z.string(), z.object({ firstCorrect: z.boolean(), solved: z.boolean() })),
});
export type ApiLessonQuiz = z.infer<typeof apiLessonQuiz>;

export const apiLesson = z.object({
  id: uuid,
  courseId: uuid,
  moduleId: uuid,
  moduleTitle: z.string(),
  moduleLabel: z.string(),
  title: z.string(),
  order: int,
  contentType: z.enum(CONTENT_TYPES),
  assetRef: z.string(),
  externalUrl: z.string(),
  scormVersion: z.string(),
  /** SCORM packages imported through Forge, played by the managed player. */
  standardsManaged: z.boolean(),
  estimatedMinutes: int.nullable(),
  xpReward: int,
  frameworkTags: z.array(z.string()),
  keyPoints: z.array(z.object({ title: z.string(), body: z.string().optional() })),
  transcript: z.string(),
  quiz: apiLessonQuiz.nullable(),
  progress: z
    .object({
      completedAt: dateTime.nullable(),
      score: int.nullable(),
      runtime: z.record(z.string(), z.unknown()),
    })
    .nullable(),
});
export type ApiLesson = z.infer<typeof apiLesson>;

export const apiMyEnrollment = apiEnrollment.extend({
  course: z.object({ id: uuid, title: z.string() }),
  nextLesson: z
    .object({
      id: uuid,
      title: z.string(),
      moduleTitle: z.string(),
      moduleLabel: z.string(),
      estimatedMinutes: int.nullable(),
    })
    .nullable(),
});
export type ApiMyEnrollment = z.infer<typeof apiMyEnrollment>;

export const apiAwardBadge = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  icon: z.string(),
  kind: z.enum(['mission', 'credential']),
});
export type ApiAwardBadge = z.infer<typeof apiAwardBadge>;

/** What a first completion earned: the data behind the award overlay. */
export const apiAward = z.object({
  /** XP paid by this completion (0 when only the streak moved). */
  awarded: int,
  totalXp: int,
  level: int,
  leveledUp: z.boolean(),
  streakDays: int,
  streakExtended: z.boolean(),
  /** Badges this completion earned (empty when none). */
  badges: z.array(apiAwardBadge),
});
export type ApiAward = z.infer<typeof apiAward>;

export const apiCompletion = z.object({
  progressPct: int,
  completed: z.boolean(),
  firstCompletion: z.boolean(),
  /** Present only on a first completion; a replay never pays twice. */
  award: apiAward.nullable(),
});
export type ApiCompletion = z.infer<typeof apiCompletion>;

export const apiCheckResult = z.object({
  questionId: z.string(),
  correct: z.boolean(),
  firstTry: z.boolean(),
  solved: z.boolean(),
  feedback: z.string().nullable(),
  completion: apiCompletion.nullable(),
});
export type ApiCheckResult = z.infer<typeof apiCheckResult>;

export const apiAttemptResult = z.object({
  earnedPoints: int,
  totalPoints: int,
  scorePct: int,
  passed: z.boolean(),
  perQuestion: z.array(
    z.object({ questionId: z.string(), correct: z.boolean(), awardedPoints: int }),
  ),
  attemptsUsed: int,
  attemptsRemaining: int.nullable(),
  completion: apiCompletion.nullable(),
});
export type ApiAttemptResult = z.infer<typeof apiAttemptResult>;

/** Response schema → OpenAPI component it must match (checked by the contract spec). */
export const LEARNING_API_CONTRACT = {
  Course: apiCourse,
  CourseOutline: apiCourseOutline,
  LessonDetail: apiLesson,
  MyEnrollment: apiMyEnrollment,
  Completion: apiCompletion,
  CheckResult: apiCheckResult,
  AttemptResult: apiAttemptResult,
} as const;
