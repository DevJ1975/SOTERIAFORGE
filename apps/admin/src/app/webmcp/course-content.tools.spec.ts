import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService, TenantService } from '@assurance/auth';
import { CourseRepository, ModuleRepository } from '@assurance/data-access';
import { CourseAuthoringService } from '@assurance/lms-core';
import type { Course, Module, Principal } from '@assurance/shared';
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

const course: Course = {
  id: 'c1',
  tenantId: 'acme',
  title: 'AI Cyber Defender',
  description: '',
  status: 'published',
  tags: [],
  badgeRefs: [],
  xpReward: 0,
  availableOffline: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

function mod(id: string, order: number, extra: Partial<Module> = {}): Module {
  return {
    id,
    courseId: 'c1',
    tenantId: 'acme',
    title: `Module ${id}`,
    order,
    contentType: 'video',
    xpReward: 0,
    badgeRefs: [],
    completion: {},
    createdAt: '2026-10-01T00:00:00.000Z',
    ...extra,
  };
}

const instructor: Principal = {
  uid: 'u1',
  claims: { role: 'instructor', tenantId: 'acme', entitlements: [] },
};

let principal: Principal | null;
let modules: Module[];
const authoring = {
  createCourse: jest.fn(async (i: { title: string }) => ({
    ...course,
    id: 'new',
    title: i.title,
    status: 'draft',
  })),
  updateCourse: jest.fn(async () => undefined),
  addModule: jest.fn(async (i: Partial<Module>) => mod('m-new', 2, i)),
  updateModule: jest.fn(async () => undefined),
  reorder: jest.fn(async () => undefined),
};
const uploader = { upload: jest.fn(async () => ({ path: 'p', downloadUrl: 'https://cdn/x.mp4' })) };

function setup(): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { principal: () => principal } },
      { provide: TenantService, useValue: { tenantId: () => 'acme' } },
      {
        provide: CourseRepository,
        useValue: {
          listAll: async () => [course],
          getById: async (_t: string, id: string) => (id === 'c1' ? course : null),
        },
      },
      {
        provide: ModuleRepository,
        useValue: {
          listOrdered: async () => modules,
          getById: async (_t: string, _c: string, id: string) =>
            modules.find((m) => m.id === id) ?? null,
        },
      },
      { provide: CourseAuthoringService, useValue: authoring },
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
    modules = [
      mod('m1', 0, { externalUrl: 'https://youtu.be/a' }),
      mod('m2', 1, { contentType: 'quiz' }),
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
    expect(authoring.createCourse).not.toHaveBeenCalled();
  });

  it('refuses authors from another tenant', async () => {
    principal = {
      uid: 'u3',
      claims: { role: 'tenant_admin', tenantId: 'other', entitlements: [] },
    };
    const res = await call(listCoursesTool, {});
    expect(res.ok).toBe(false);
  });

  it('lists courses and gets one with ordered modules', async () => {
    expect(await call(listCoursesTool, {})).toMatchObject({
      ok: true,
      courses: [{ id: 'c1', title: 'AI Cyber Defender', status: 'published' }],
    });
    const res = await call(getCourseTool, { courseId: 'c1' });
    expect(res).toMatchObject({ ok: true, modules: [{ id: 'm1' }, { id: 'm2' }] });
  });

  it('reports invalid arguments instead of writing', async () => {
    const res = await call(createCourseDraftTool, { title: '' });
    expect(res).toEqual({ ok: false, error: expect.stringContaining('title') });
    expect(authoring.createCourse).not.toHaveBeenCalled();
  });

  it('creates drafts in the host tenant, ignoring any tenant the agent passes', async () => {
    const res = await call(createCourseDraftTool, { title: 'New', tenantId: 'evil' });
    expect(res).toEqual({ ok: true, courseId: 'new', status: 'draft' });
    expect(authoring.createCourse).toHaveBeenCalledWith({ tenantId: 'acme', title: 'New' });
  });

  it('updates course details but never the publish status', async () => {
    const res = await call(updateCourseTool, {
      courseId: 'c1',
      title: 'Renamed',
      status: 'archived',
    });
    expect(res.ok).toBe(true);
    expect(authoring.updateCourse).toHaveBeenCalledWith('acme', 'c1', { title: 'Renamed' });
  });

  it('requires at least one field to change', async () => {
    expect((await call(updateCourseTool, { courseId: 'c1' })).ok).toBe(false);
    expect((await call(updateModuleTool, { courseId: 'c1', moduleId: 'm1' })).ok).toBe(false);
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
    expect(authoring.addModule).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'acme', courseId: 'c1', assetRef: 'quiz-1' }),
    );
  });

  it('merges completion rules on module update', async () => {
    modules[0] = mod('m1', 0, { completion: { minProgressPct: 80 } });
    await call(updateModuleTool, { courseId: 'c1', moduleId: 'm1', minScore: 70 });
    expect(authoring.updateModule).toHaveBeenCalledWith('acme', 'c1', 'm1', {
      completion: { minProgressPct: 80, minScore: 70 },
    });
  });

  it('only reorders with every module exactly once', async () => {
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['m2'] })).ok).toBe(false);
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['m2', 'm2'] })).ok).toBe(
      false,
    );
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['m2', 'zz'] })).ok).toBe(
      false,
    );
    expect(authoring.reorder).not.toHaveBeenCalled();
    expect((await call(reorderModulesTool, { courseId: 'c1', moduleIds: ['m2', 'm1'] })).ok).toBe(
      true,
    );
    expect(authoring.reorder).toHaveBeenCalledWith('acme', 'c1', ['m2', 'm1']);
  });

  describe('forge_upload_module_video', () => {
    const base = { courseId: 'c1', moduleId: 'm1', fileName: 'lesson.mp4', mimeType: 'video/mp4' };

    it('uploads inline data and makes it the module source', async () => {
      const res = await call(uploadModuleVideoTool, { ...base, base64Data: btoa('fake-mp4') });
      expect(res).toMatchObject({ ok: true, assetRef: 'https://cdn/x.mp4', bytes: 8 });
      expect(uploader.upload).toHaveBeenCalledWith('acme', 'c1', expect.any(Blob), 'lesson.mp4');
      expect(authoring.updateModule).toHaveBeenCalledWith('acme', 'c1', 'm1', {
        assetRef: 'https://cdn/x.mp4',
        externalUrl: undefined,
      });
    });

    it('rejects non-video modules, non-video MIME types and ambiguous sources', async () => {
      expect(
        (await call(uploadModuleVideoTool, { ...base, moduleId: 'm2', base64Data: 'AA==' })).error,
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
