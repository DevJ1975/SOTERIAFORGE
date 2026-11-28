import {
  type EnvironmentProviders,
  type WebMcpClient,
  inject,
  makeEnvironmentProviders,
  provideExperimentalWebMcpTools,
} from '@angular/core';
import { z } from 'zod';
import { AuthService, TenantService, canAccessTenant, canAuthor } from '@assurance/auth';
import {
  type ApiCourseOutline,
  type ApiLesson,
  AuthoringApi,
  authoringErrorMessage,
} from '@assurance/lms-core';
import { CONTENT_TYPES } from '@assurance/shared';
import { CourseAssetUploader, MAX_UPLOAD_BYTES } from './course-asset-uploader';

/**
 * WebMCP tools that let an in-browser AI agent read, create and update course
 * content on behalf of the signed-in author (Angular 22 experimental WebMCP).
 *
 * Tool "modules" are lessons: the content items learners work through. A course
 * also has module groups ("sections") that lessons sit in; `forge_add_module`
 * takes an optional `sectionId` and otherwise appends to the last section.
 *
 * Guardrails:
 * - Every call runs as the signed-in user, inside the tenant resolved from the
 *   host (the API client sends it; it never comes from the agent). Tools refuse
 *   unless the user may author in that tenant; the Forge API enforces the same
 *   server-side.
 * - Agents can draft and edit, but cannot publish, unpublish, archive or delete.
 *   Those stay human actions in the course editor.
 * - Arguments are re-validated with zod; the JSON schemas are only hints.
 */

/** Max decoded size for inline (base64) uploads; larger files go by URL. */
export const MAX_INLINE_UPLOAD_BYTES = 10 * 1024 * 1024;

type ToolResult = string;

const ok = (data: unknown): ToolResult => JSON.stringify({ ok: true, ...(data as object) });
const fail = (error: string): ToolResult => JSON.stringify({ ok: false, error });

/** Resolves the author context or explains why the agent can't act. */
function authorContext(): { tenantId: string } | { error: string } {
  const principal = inject(AuthService).principal();
  const tenantId = inject(TenantService).tenantId();
  if (!principal) return { error: 'Not signed in. Ask the user to sign in to Forge admin.' };
  if (!tenantId) return { error: 'No tenant for this host; open the tenant admin site.' };
  if (!canAuthor(principal.claims) || !canAccessTenant(principal.claims, tenantId)) {
    return { error: 'The signed-in user cannot edit course content in this tenant.' };
  }
  return { tenantId };
}

/** Services a tool body uses, injected before any `await` (injection context is sync-only). */
interface Deps {
  api: AuthoringApi;
  uploader: CourseAssetUploader;
}

/** Validates args, resolves the author context and turns thrown errors into results. */
function run<S extends z.ZodTypeAny>(
  schema: S,
  args: unknown,
  body: (input: z.infer<S>, deps: Deps) => Promise<ToolResult>,
): Promise<ToolResult> {
  const ctx = authorContext();
  if ('error' in ctx) return Promise.resolve(fail(ctx.error));
  const deps: Deps = {
    api: inject(AuthoringApi),
    uploader: inject(CourseAssetUploader),
  };
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'args'}: ${i.message}`);
    return Promise.resolve(fail(`Invalid arguments. ${issues.join('; ')}`));
  }
  return body(parsed.data, deps).catch((err: unknown) =>
    fail(authoringErrorMessage(err, err instanceof Error ? err.message : String(err))),
  );
}

/** What the agent sees for one lesson (its "module"). */
function moduleSummary(l: ApiLesson, order: number) {
  return {
    id: l.id,
    title: l.title,
    order,
    sectionId: l.moduleId,
    sectionTitle: l.moduleTitle,
    contentType: l.contentType,
    externalUrl: l.externalUrl || undefined,
    assetRef: l.assetRef || undefined,
    quizId: l.quiz?.id,
    estimatedMinutes: l.estimatedMinutes ?? undefined,
    xpReward: l.xpReward,
  };
}

async function requireCourse({ api }: Deps, courseId: string): Promise<ApiCourseOutline> {
  try {
    return await api.course(courseId);
  } catch {
    throw new Error(`Course ${courseId} not found.`);
  }
}

async function requireModule({ api }: Deps, courseId: string, moduleId: string) {
  let lesson: ApiLesson | null = null;
  try {
    lesson = await api.lesson(moduleId);
  } catch {
    // fall through to the not-found error
  }
  if (!lesson || lesson.courseId !== courseId) {
    throw new Error(`Module ${moduleId} not found in course ${courseId}.`);
  }
  return lesson;
}

// ---- argument schemas (zod is authoritative) --------------------------------

const id = z.string().min(1).max(200);
const httpsUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'must be an https:// URL');
const minutes = z.number().int().min(0).max(600);
const xp = z.number().int().min(0).max(1000);
const tags = z.array(z.string().min(1).max(50)).max(20);

const getCourseArgs = z.object({ courseId: id });
const createCourseArgs = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  tags: tags.optional(),
});
const updateCourseArgs = z
  .object({
    courseId: id,
    title: z.string().min(1).max(300).optional(),
    description: z.string().max(5000).optional(),
    tags: tags.optional(),
    availableOffline: z.boolean().optional(),
  })
  .refine((a) => Object.keys(a).length > 1, 'give at least one field to change');
const addModuleArgs = z
  .object({
    courseId: id,
    sectionId: id.optional(),
    title: z.string().min(1).max(300),
    contentType: z.enum(CONTENT_TYPES),
    externalUrl: httpsUrl.optional(),
    contentRef: id.optional(),
    estimatedMinutes: minutes.optional(),
  })
  .refine(
    (a) => !['quiz', 'game'].includes(a.contentType) || !!a.contentRef,
    'quiz and game modules need contentRef (the quiz or game id)',
  );
const updateModuleArgs = z
  .object({
    courseId: id,
    moduleId: id,
    title: z.string().min(1).max(300).optional(),
    externalUrl: httpsUrl.optional(),
    estimatedMinutes: minutes.optional(),
    xpReward: xp.optional(),
  })
  .refine((a) => Object.keys(a).length > 2, 'give at least one field to change');
const reorderArgs = z.object({ courseId: id, moduleIds: z.array(id).min(1).max(500) });
const uploadVideoArgs = z
  .object({
    courseId: id,
    moduleId: id,
    fileName: z.string().min(1).max(200),
    mimeType: z.string().regex(/^video\/[\w.+-]+$/, 'must be a video/* MIME type'),
    sourceUrl: httpsUrl.optional(),
    base64Data: z.string().min(1).optional(),
  })
  .refine((a) => !!a.sourceUrl !== !!a.base64Data, 'give exactly one of sourceUrl or base64Data');

// ---- upload helpers ---------------------------------------------------------

async function fetchSource(url: string, mimeType: string, signal: AbortSignal): Promise<Blob> {
  const res = await fetch(url, { signal, credentials: 'omit' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} from ${url}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES)
    throw new Error(`File is larger than ${MAX_UPLOAD_BYTES} bytes.`);
  const blob = await res.blob();
  return blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
}

function decodeBase64(data: string, mimeType: string): Blob {
  const clean = data.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if ((clean.length * 3) / 4 > MAX_INLINE_UPLOAD_BYTES) {
    throw new Error(
      `Inline uploads are limited to ${MAX_INLINE_UPLOAD_BYTES} bytes; use sourceUrl instead.`,
    );
  }
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new Error('base64Data is not valid base64.');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

// ---- tools ------------------------------------------------------------------

export const listCoursesTool = {
  name: 'forge_list_courses',
  description:
    'List every course in the current Forge tenant (drafts, published and archived) with id, title, status and tags. Call this first to find a courseId.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: (args: unknown) =>
    run(z.object({}), args, async (_input, { api }) => {
      const courses = await api.courses();
      return ok({
        courses: courses.map((c) => ({
          id: c.id,
          title: c.title,
          status: c.status,
          tags: c.tags,
          availableOffline: c.availableOffline,
        })),
      });
    }),
} as const;

export const getCourseTool = {
  name: 'forge_get_course',
  description:
    'Get one course with its modules (lessons) in learner order: titles, content types, URLs, estimated minutes and XP, plus the course sections the lessons sit in.',
  inputSchema: {
    type: 'object',
    properties: { courseId: { type: 'string', description: 'Course id from forge_list_courses' } },
    required: ['courseId'],
  },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  execute: (args: unknown) =>
    run(getCourseArgs, args, async ({ courseId }, deps) => {
      const outline = await requireCourse(deps, courseId);
      const sections = outline.modules;
      // Sections and lessons are reported below; the enrollment is the author's own, not content.
      const course = { ...outline, modules: undefined, enrollment: undefined };
      const lessons = await Promise.all(
        sections.flatMap((m) => m.lessons).map((l) => deps.api.lesson(l.id)),
      );
      return ok({
        course,
        sections: sections.map((m) => ({ id: m.id, title: m.title, label: m.label })),
        modules: lessons.map((l, i) => moduleSummary(l, i)),
      });
    }),
} as const;

export const createCourseDraftTool = {
  name: 'forge_create_course_draft',
  description:
    'Create a new DRAFT course. Learners cannot see it until a human publishes it in the course editor.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Course title (1–300 characters)' },
      description: { type: 'string', description: 'Course description (up to 5000 characters)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Up to 20 tags' },
    },
    required: ['title'],
  },
  annotations: { consequentialHint: true },
  execute: (args: unknown) =>
    run(createCourseArgs, args, async (input, { api }) => {
      const course = await api.createCourse(input);
      return ok({ courseId: course.id, status: course.status });
    }),
} as const;

export const updateCourseTool = {
  name: 'forge_update_course',
  description:
    'Update course details: title, description, tags or offline availability. Changes to a published course are visible to learners immediately. Does not change publish status.',
  inputSchema: {
    type: 'object',
    properties: {
      courseId: { type: 'string' },
      title: { type: 'string' },
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      availableOffline: { type: 'boolean' },
    },
    required: ['courseId'],
  },
  annotations: { consequentialHint: true },
  execute: (args: unknown) =>
    run(updateCourseArgs, args, async ({ courseId, ...patch }, deps) => {
      const course = await requireCourse(deps, courseId);
      await deps.api.updateCourse(courseId, patch);
      return ok({ courseId, status: course.status, updated: Object.keys(patch) });
    }),
} as const;

export const addModuleTool = {
  name: 'forge_add_module',
  description:
    'Append a module (a lesson) to a course. It goes in sectionId, or the last section (one is created if the course has none). For video use externalUrl, or add the module and then call forge_upload_module_video. For quiz or game modules, contentRef is the quiz or game id.',
  inputSchema: {
    type: 'object',
    properties: {
      courseId: { type: 'string' },
      sectionId: { type: 'string', description: 'Section id from forge_get_course (optional)' },
      title: { type: 'string' },
      contentType: { type: 'string', enum: [...CONTENT_TYPES] },
      externalUrl: { type: 'string', description: 'https:// URL of the content' },
      contentRef: { type: 'string', description: 'Quiz or game id for quiz/game modules' },
      estimatedMinutes: { type: 'integer', minimum: 0 },
    },
    required: ['courseId', 'title', 'contentType'],
  },
  annotations: { consequentialHint: true },
  execute: (args: unknown) =>
    run(addModuleArgs, args, async (input, deps) => {
      const course = await requireCourse(deps, input.courseId);
      let section = input.sectionId
        ? course.modules.find((m) => m.id === input.sectionId)
        : course.modules[course.modules.length - 1];
      if (input.sectionId && !section) {
        return fail(`Section ${input.sectionId} not found in course ${input.courseId}.`);
      }
      if (!section) {
        const created = await deps.api.addModule(input.courseId, { title: 'Lessons', order: 0 });
        section = { ...created, lessons: [] };
      }
      const isQuiz = input.contentType === 'quiz';
      const isGame = input.contentType === 'game';
      const lesson = await deps.api.addLesson(section.id, {
        title: input.title,
        contentType: input.contentType,
        order: section.lessons.length,
        externalUrl: input.externalUrl,
        assetRef: isGame ? input.contentRef : undefined,
        quizId: isQuiz ? input.contentRef : undefined,
        estimatedMinutes: input.estimatedMinutes,
      });
      return ok({ module: moduleSummary(lesson, section.lessons.length) });
    }),
} as const;

export const updateModuleTool = {
  name: 'forge_update_module',
  description:
    'Update a module (lesson): title, external URL, estimated minutes or XP reward (0–1000). Changes to a published course are visible to learners immediately.',
  inputSchema: {
    type: 'object',
    properties: {
      courseId: { type: 'string' },
      moduleId: { type: 'string' },
      title: { type: 'string' },
      externalUrl: { type: 'string' },
      estimatedMinutes: { type: 'integer', minimum: 0 },
      xpReward: { type: 'integer', minimum: 0, maximum: 1000 },
    },
    required: ['courseId', 'moduleId'],
  },
  annotations: { consequentialHint: true },
  execute: (args: unknown) =>
    run(updateModuleArgs, args, async ({ courseId, moduleId, ...fields }, deps) => {
      await requireModule(deps, courseId, moduleId);
      await deps.api.updateLesson(moduleId, fields);
      return ok({ moduleId, updated: Object.keys(fields) });
    }),
} as const;

export const reorderModulesTool = {
  name: 'forge_reorder_modules',
  description:
    'Set the learner order of a course’s modules (lessons). moduleIds must list every module in the course exactly once, in the new order. Modules stay in their section; only their order within it changes.',
  inputSchema: {
    type: 'object',
    properties: {
      courseId: { type: 'string' },
      moduleIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['courseId', 'moduleIds'],
  },
  annotations: { consequentialHint: true },
  execute: (args: unknown) =>
    run(reorderArgs, args, async ({ courseId, moduleIds }, deps) => {
      const course = await requireCourse(deps, courseId);
      const known = new Set(course.modules.flatMap((m) => m.lessons.map((l) => l.id)));
      const given = new Set(moduleIds);
      if (given.size !== moduleIds.length || given.size !== known.size) {
        return fail(`moduleIds must list all ${known.size} modules exactly once.`);
      }
      const unknown = moduleIds.filter((m) => !known.has(m));
      if (unknown.length) return fail(`Unknown module ids: ${unknown.join(', ')}`);
      // A lesson's position is within its section: renumber each section by the new sequence.
      const position = new Map(moduleIds.map((m, i) => [m, i]));
      for (const section of course.modules) {
        const ordered = section.lessons
          .map((l) => l.id)
          .sort((a, b) => (position.get(a) ?? 0) - (position.get(b) ?? 0));
        await deps.api.reorderLessons(ordered);
      }
      return ok({ courseId, order: moduleIds });
    }),
} as const;

export const uploadModuleVideoTool = {
  name: 'forge_upload_module_video',
  description:
    'Upload a video file to an existing video module (lesson) and make it the module’s source (replacing any external URL). Give the file as an https sourceUrl (up to 500 MB) or as base64Data (up to 10 MB).',
  inputSchema: {
    type: 'object',
    properties: {
      courseId: { type: 'string' },
      moduleId: { type: 'string' },
      fileName: { type: 'string', description: 'e.g. module-5-1.mp4' },
      mimeType: { type: 'string', description: 'e.g. video/mp4' },
      sourceUrl: { type: 'string', description: 'https:// URL the browser can fetch' },
      base64Data: { type: 'string', description: 'File contents, base64-encoded' },
    },
    required: ['courseId', 'moduleId', 'fileName', 'mimeType'],
  },
  annotations: { consequentialHint: true },
  execute: (args: unknown, client?: WebMcpClient) =>
    run(uploadVideoArgs, args, async (input, deps) => {
      const mod = await requireModule(deps, input.courseId, input.moduleId);
      if (mod.contentType !== 'video') {
        return fail(`Module ${mod.id} is a ${mod.contentType} module, not video.`);
      }
      const blob = input.sourceUrl
        ? await fetchSource(
            input.sourceUrl,
            input.mimeType,
            client?.signal ?? new AbortController().signal,
          )
        : decodeBase64(input.base64Data as string, input.mimeType);
      const asset = await deps.uploader.upload(blob, input.fileName);
      // The player prefers externalUrl, so clear it to make the upload the source.
      await deps.api.updateLesson(mod.id, { assetRef: asset.assetRef, externalUrl: '' });
      return ok({ moduleId: mod.id, bytes: blob.size, assetRef: asset.assetRef });
    }),
} as const;

export const COURSE_CONTENT_TOOLS = [
  listCoursesTool,
  getCourseTool,
  createCourseDraftTool,
  updateCourseTool,
  addModuleTool,
  updateModuleTool,
  reorderModulesTool,
  uploadModuleVideoTool,
] as const;

/**
 * Registers the course-content WebMCP tools for the lifetime of the providing
 * injector. Browsers without WebMCP, and SSR, make this a no-op.
 */
export function provideCourseContentWebMcpTools(): EnvironmentProviders {
  return makeEnvironmentProviders(
    COURSE_CONTENT_TOOLS.map((tool) => provideExperimentalWebMcpTools([tool])),
  );
}
