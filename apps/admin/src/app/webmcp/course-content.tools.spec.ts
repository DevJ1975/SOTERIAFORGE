import { HttpErrorResponse } from '@angular/common/http';
import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService, TenantService } from '@assurance/auth';
import { type ApiLesson, AuthoringApi } from '@assurance/lms-core';
import type { Principal } from '@assurance/shared';
import { CourseAssetUploader, safeFileName } from './course-asset-uploader';
import {
  COURSE_CONTENT_TOOLS,
  addModuleTool,
  createCourseDraftTool,
  getCourseTool,
  listCoursesTool,
  provideCourseContentWebMcpTools,
  reorderModulesTool,
  updateCourseTool,
  updateModuleTool,
  uploadModuleVideoTool,
} from './course-content.tools';

const course = {
  id: 'c1',
  title: 'AI Cyber Defender',
  description: '',
  status: 'published',
  tags: [],
  availableOffline: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function lesson(id: string, extra: Partial<ApiLesson> = {}): ApiLesson {
  return {
    id,
    courseId: 'c1',
    moduleId: 's1',
    moduleTitle: 'Section 1',
    moduleLabel: '',
    title: `Lesson ${id}`,
    order: 0,
    contentType: 'video',
    assetRef: '',
    externalUrl: '',
    scormVersion: '',
    estimatedMinutes: null,
    xpReward: 0,
    frameworkTags: [],
    keyPoints: [],
    quiz: null,
    progress: null,
    ...extra,
  };
}

function summary(id: string) {
  return {
    id,
    title: `Lesson ${id}`,
    order: 0,
    contentType: 'video' as const,
    estimatedMinutes: null,
    frameworkTags: [],
    hasQuiz: false,
    completed: false,
  };
}

const instructor: Principal = {
  uid: 'u1',
  claims: { role: 'instructor', tenantId: 'acme', entitlements: [] },
};

let principal: Principal | null;
let lessons: ApiLesson[];
let sections: {
  id: string;
  courseId: string;
  title: string;
  label: string;
  order: number;
  lessons: ReturnType<typeof summary>[];
}[];
const api = {
  courses: jest.fn(async () => [course]),
  course: jest.fn(async (id: string) => {
    if (id !== 'c1') throw new Error('404');
    return { ...course, modules: sections, enrollment: null };
  }),
  lesson: jest.fn(async (id: string) => {
    const found = lessons.find((l) => l.id === id);
    if (!found) throw new Error('404');
    return found;
  }),
  createCourse: jest.fn(async (i: { title: string }) => ({
    ...course,
    id: 'new',
    title: i.title,
    status: 'draft',
  })),
  updateCourse: jest.fn(async () => course),
  addModule: jest.fn(async (_c: string, i: { title: string }) => ({
    id: 's-new',
    courseId: 'c1',
    title: i.title,
    label: '',
    order: 0,
  })),
  addLesson: jest.fn(async (moduleId: string, i: Partial<ApiLesson>) =>
    lesson('l-new', { ...i, moduleId } as Partial<ApiLesson>),
  ),
  updateLesson: jest.fn(async () => lesson('l1')),
  reorderLessons: jest.fn(async () => undefined),
};
const uploader = {
  upload: jest.fn(async () => ({
    id: 'a1',
    assetRef: 'asset:a1',
    filename: 'x.mp4',
    contentType: 'video/mp4',
    size: 8,
  })),
};

function setup(): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { principal: () => principal } },
      { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      { provide: AuthoringApi, useValue: api },
      { provide: CourseAssetUploader, useValue: uploader },
    ],
  });
}

/** Runs a tool's execute the way Angular does: inside the injector's context. */
async function call(
  tool: { execute: (args: unknown, client?: { signal: AbortSignal }) => Promise<string> },
  args: unknown,
): Promise<{ ok: boolean; error?: string } & Record<string, unknown>> {
  const out = await TestBed.runInInjectionContext(() =>
    tool.execute(args, { signal: new AbortController().signal }),
  );
  return JSON.parse(out);
}

describe('course content WebMCP tools', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.resetTestingModule();
    principal = instructor;
    lessons = [
      lesson('l1', { externalUrl: 'https://youtu.be/a' }),
      lesson('l2', { contentType: 'quiz' }),
    ];
    sections = [
      {
        id: 's1',
        courseId: 'c1',
        title: 'Section 1',
        label: '',
        order: 0,
        lessons: [summary('l1'), summary('l2')],
      },
    ];
    setup();
  });

  it('refuses when nobody is signed in', async () => {
    principal = null;
    const res = await call(listCoursesTool, {});
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/not signed in/i) });
  });

  it('refuses learners', async () => {
    principal = { uid: 'u2', claims: { role: 'learner', tenantId: 'acme', entitlements: [] } };
    const res = await call(createCourseDraftTool, { title: 'x' });
    expect(res.ok).toBe(false);
    expect(api.createCourse).not.toHaveBeenCalled();
  });

  it('refuses authors from another tenant', async () => {
    principal = {
      uid: 'u3',
      claims: { role: 'tenant_admin', tenantId: 'other', entitlements: [] },
    };
    const res = await call(listCoursesTool, {});
    expect(res.ok).toBe(false);
  });

  it('lists courses and gets one with its lessons in learner order', async () => {
    expect(await call(listCoursesTool, {})).toMatchObject({
      ok: true,
      courses: [{ id: 'c1', title: 'AI Cyber Defender', status: 'published' }],
    });
    const res = await call(getCourseTool, { courseId: 'c1' });
    expect(res).toMatchObject({
      ok: true,
      sections: [{ id: 's1', title: 'Section 1' }],
      modules: [
        { id: 'l1', order: 0, sectionId: 's1', externalUrl: 'https://youtu.be/a' },
        { id: 'l2', order: 1, contentType: 'quiz' },
      ],
    });
    expect(res['course']).not.toHaveProperty('modules');
    expect(res['course']).not.toHaveProperty('enrollment');
  });

  it('reports an unknown course', async () => {
    const res = await call(getCourseTool, { courseId: 'zz' });
    expect(res).toEqual({ ok: false, error: 'Course zz not found.' });
  });

  it('reports invalid arguments instead of writing', async () => {
    const res = await call(createCourseDraftTool, { title: '' });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('title') });
    expect(api.createCourse).not.toHaveBeenCalled();
  });

  it('creates drafts, ignoring any tenant the agent passes', async () => {
    const res = await call(createCourseDraftTool, { title: 'New', tenantId: 'evil' });
    expect(res).toEqual({ ok: true, courseId: 'new', status: 'draft' });
    expect(api.createCourse).toHaveBeenCalledWith({ title: 'New' });
  });

  it('updates course details but never the publish status', async () => {
    const res = await call(updateCourseTool, {
      courseId: 'c1',
      title: 'Renamed',
      status: 'archived',
    });
    expect(res.ok).toBe(true);
    expect(api.updateCourse).toHaveBeenCalledWith('c1', { title: 'Renamed' });
  });

  it('requires at least one field to change', async () => {
    expect((await call(updateCourseTool, { courseId: 'c1' })).ok).toBe(false);
    expect((await call(updateModuleTool, { courseId: 'c1', moduleId: 'l1' })).ok).toBe(false);
  });

  it('needs contentRef for quiz modules and https for URLs', async () => {
    expect(
      (await call(addModuleTool, { courseId: 'c1', title: 'Q', contentType: 'quiz' })).ok,
    ).toBe(false);
    const http = await call(addModuleTool, {
      courseId: 'c1',
      title: 'V',
      contentType: 'video',
      externalUrl: 'http://insecure.example/v.mp4',
    });
    expect(http.error).toMatch(/https/);
    const res = await call(addModuleTool, {
      courseId: 'c1',
      title: 'Q',
      contentType: 'quiz',
      contentRef: 'quiz-1',
    });
    expect(res.ok).toBe(true);
    expect(api.addLesson).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ title: 'Q', contentType: 'quiz', quizId: 'quiz-1', order: 2 }),
    );
  });

  it('keeps a game id in assetRef and honours an explicit section', async () => {
    sections.push({ id: 's2', courseId: 'c1', title: 'Two', label: '', order: 1, lessons: [] });
    const res = await call(addModuleTool, {
      courseId: 'c1',
      sectionId: 's2',
      title: 'G',
      contentType: 'game',
      contentRef: 'game-1',
    });
    expect(res.ok).toBe(true);
    expect(api.addLesson).toHaveBeenCalledWith(
      's2',
      expect.objectContaining({ assetRef: 'game-1', quizId: undefined, order: 0 }),
    );
    const bad = await call(addModuleTool, {
      courseId: 'c1',
      sectionId: 'nope',
      title: 'G',
      contentType: 'video',
    });
    expect(bad.error).toMatch(/Section nope not found/);
  });

  it('creates a section when the course has none', async () => {
    sections = [];
    const res = await call(addModuleTool, { courseId: 'c1', title: 'First', contentType: 'video' });
    expect(res.ok).toBe(true);
    expect(api.addModule).toHaveBeenCalledWith('c1', { title: 'Lessons', order: 0 });
    expect(api.addLesson).toHaveBeenCalledWith('s-new', expect.objectContaining({ order: 0 }));
  });

  it('updates a lesson, checking it belongs to the course', async () => {
    const res = await call(updateModuleTool, { courseId: 'c1', moduleId: 'l1', xpReward: 20 });
    expect(res).toEqual({ ok: true, moduleId: 'l1', updated: ['xpReward'] });
    expect(api.updateLesson).toHaveBeenCalledWith('l1', { xpReward: 20 });
    lessons.push(lesson('other', { courseId: 'c2' }));
    const wrong = await call(updateModuleTool, { courseId: 'c1', moduleId: 'other', xpReward: 1 });
    expect(wrong.ok).toBe(false);
  });

  it('surfaces the API message when it refuses a write', async () => {
    api.updateLesson.mockRejectedValueOnce(
      new HttpErrorResponse({
        status: 409,
        error: { detail: 'Package lessons have immutable content.' },
      }),
    );
    const res = await call(updateModuleTool, { courseId: 'c1', moduleId: 'l1', title: 'x' });
    expect(res).toEqual({ ok: false, error: 'Package lessons have immutable content.' });
  });

  it('only reorders with every module exactly once', async () => {
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['l2'] })).ok).toBe(false);
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['l2', 'l2'] })).ok).toBe(
      false,
    );
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['l2', 'zz'] })).ok).toBe(
      false,
    );
    expect(api.reorderLessons).not.toHaveBeenCalled();
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['l2', 'l1'] })).ok).toBe(
      true,
    );
    expect(api.reorderLessons).toHaveBeenCalledWith(['l2', 'l1']);
  });

  describe('forge_upload_module_video', () => {
    const base = { courseId: 'c1', moduleId: 'l1', fileName: 'lesson.mp4', mimeType: 'video/mp4' };

    it('uploads inline data and makes it the module source', async () => {
      const res = await call(uploadModuleVideoTool, { ...base, base64Data: btoa('fake-mp4') });
      expect(res).toMatchObject({ ok: true, assetRef: 'asset:a1', bytes: 8 });
      expect(uploader.upload).toHaveBeenCalledWith(expect.any(Blob), 'lesson.mp4');
      expect(api.updateLesson).toHaveBeenCalledWith('l1', {
        assetRef: 'asset:a1',
        externalUrl: '',
      });
    });

    it('rejects non-video modules, non-video MIME types and ambiguous sources', async () => {
      expect(
        (await call(uploadModuleVideoTool, { ...base, moduleId: 'l2', base64Data: 'AA==' })).error,
      ).toMatch(/quiz module/);
      expect(
        (await call(uploadModuleVideoTool, { ...base, mimeType: 'text/html', base64Data: 'AA==' }))
          .ok,
      ).toBe(false);
      expect(
        (
          await call(uploadModuleVideoTool, {
            ...base,
            base64Data: 'AA==',
            sourceUrl: 'https://a/b.mp4',
          })
        ).ok,
      ).toBe(false);
      expect(uploader.upload).not.toHaveBeenCalled();
    });

    it('fetches https sources and surfaces download failures', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404, headers: new Headers() })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-length': '3' }),
          blob: async () => new Blob(['abc'], { type: 'video/mp4' }),
        });
      (globalThis as { fetch: unknown }).fetch = fetchMock;

      const missing = await call(uploadModuleVideoTool, {
        ...base,
        sourceUrl: 'https://media.example/x.mp4',
      });
      expect(missing.error).toMatch(/HTTP 404/);
      const res = await call(uploadModuleVideoTool, {
        ...base,
        sourceUrl: 'https://media.example/x.mp4',
      });
      expect(res).toMatchObject({ ok: true, bytes: 3 });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://media.example/x.mp4',
        expect.objectContaining({ credentials: 'omit' }),
      );
    });
  });

  it('sanitizes uploaded file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('etc-passwd');
    expect(safeFileName('Lesson 5.1 (final).mp4')).toBe('Lesson-5.1-final-.mp4');
    expect(safeFileName('///')).toBe('asset');
  });
});

describe('provideCourseContentWebMcpTools', () => {
  afterEach(() => {
    delete (navigator as { modelContext?: unknown }).modelContext;
  });

  it('registers every tool with the browser and unregisters when the injector is destroyed', async () => {
    const signals: AbortSignal[] = [];
    const registerTool = jest.fn(async (_tool: { name: string }, opts: { signal: AbortSignal }) => {
      signals.push(opts.signal);
    });
    (navigator as { modelContext?: unknown }).modelContext = { registerTool };

    const injector = createEnvironmentInjector(
      [provideCourseContentWebMcpTools()],
      TestBed.inject(EnvironmentInjector),
    );
    await Promise.resolve();

    expect(registerTool.mock.calls.map(([t]) => t.name).sort()).toEqual(
      COURSE_CONTENT_TOOLS.map((t) => t.name).sort(),
    );
    expect(signals.every((s) => !s.aborted)).toBe(true);
    injector.destroy();
    expect(signals.every((s) => s.aborted)).toBe(true);
  });

  it('exposes no publish, archive or delete tool', () => {
    expect(COURSE_CONTENT_TOOLS.map((t) => t.name).join(' ')).not.toMatch(
      /publish|archive|delete|remove/,
    );
  });
});
