import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

let compiledDirectory: string | undefined;
test.afterEach(() => {
  if (compiledDirectory) rmSync(compiledDirectory, { recursive: true, force: true });
  compiledDirectory = undefined;
});

// The UI and media are real; Firebase/HTTP transport is covered by API/unit tests.
// Only the classroom list and credential HTTP responses are supplied by this fixture.
test('Chrome participants exchange camera and microphone through self-hosted LiveKit', async ({
  browser,
}) => {
  test.skip(process.env['LIVEKIT_SMOKE'] !== '1', 'Start the local LiveKit media profile first.');
  const root = path.resolve(__dirname, '../../..');
  compiledDirectory = mkdtempSync(path.join(tmpdir(), 'forge-chrome-aot-'));
  execFileSync(
    path.join(root, 'node_modules/.bin/ngc'),
    [
      '-p',
      path.join(root, 'apps/learner/tsconfig.app.json'),
      '--outDir',
      compiledDirectory,
      '--rootDir',
      root,
    ],
    { cwd: root, stdio: 'pipe' },
  );
  const componentModule = path.join(
    compiledDirectory,
    'apps/learner/src/app/pages/engage/engage.component.js',
  );
  const credentials = JSON.parse(
    execFileSync(
      'uv',
      [
        'run',
        'python',
        '-c',
        `
import json, os, uuid
os.environ["DJANGO_SETTINGS_MODULE"] = "forge.settings_test"
import django
django.setup()
from django.conf import settings
from apps.accounts.models import Member
from apps.engage.models import Classroom
from apps.engage.media import join_credentials
settings.DEBUG = True
settings.LIVEKIT_URL = "ws://127.0.0.1:7880"
settings.LIVEKIT_API_URL = "http://127.0.0.1:7880"
settings.LIVEKIT_API_KEY = "devkey"
settings.LIVEKIT_API_SECRET = "secret"
room = Classroom(id=uuid.uuid4(), tenant_id="chrome-smoke", title="Chrome classroom")
credentials = {
    role: join_credentials(
        room, Member(id=uuid.uuid4(), display_name=role),
        can_screen_share=(role == "teacher")
    )
    for role in ["teacher", "learner"]
}
print(json.dumps(credentials))
`,
      ],
      { cwd: path.join(root, 'backend'), encoding: 'utf8' },
    ),
  ) as Record<'teacher' | 'learner', { serverUrl: string; token: string; canScreenShare: boolean }>;
  const compiled = await build({
    stdin: {
      contents: `
        import '@angular/compiler';
        import { provideZonelessChangeDetection } from '@angular/core';
        import { bootstrapApplication } from '@angular/platform-browser';
        import { provideHttpClient } from '@angular/common/http';
        import { ASSURANCE_ENV, ForgeSession } from '@assurance/auth';
        import { EngageComponent } from ${JSON.stringify(componentModule)};
        bootstrapApplication(EngageComponent, { providers: [
          provideZonelessChangeDetection(), provideHttpClient(),
          { provide: ASSURANCE_ENV, useValue: { apiBaseUrl: location.origin } },
          { provide: ForgeSession, useValue: {
            canAuthor: () => location.search.includes('teacher')
          } }
        ] });
      `,
      resolveDir: root,
      loader: 'ts',
    },
    tsconfig: path.join(root, 'tsconfig.base.json'),
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    nodePaths: [path.join(root, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"test"' },
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname === '/classroom.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(compiled.outputFiles[0].text);
    } else if (url.pathname === '/api/engage/classrooms') {
      response.setHeader('Content-Type', 'application/json');
      response.end(
        JSON.stringify([
          {
            id: 'chrome-test',
            title: 'Chrome classroom',
            createdBy: 'teacher',
            createdAt: new Date().toISOString(),
            maxParticipants: 21,
          },
        ]),
      );
    } else if (url.pathname.endsWith('/join')) {
      const role = new URL(request.headers.referer || 'http://localhost').searchParams.get('role');
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(credentials[role === 'teacher' ? 'teacher' : 'learner']));
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><html><body><assurance-engage></assurance-engage><script src="/classroom.js"></script></body></html>',
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  try {
    const teacher = await context.newPage();
    const learner = await context.newPage();
    const errors: string[] = [];
    for (const page of [teacher, learner]) {
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && /NG\d+/.test(message.text())) errors.push(message.text());
      });
    }
    await teacher.goto(`${origin}/?role=teacher`);
    await learner.goto(`${origin}/?role=learner`);
    await teacher.getByRole('button', { name: 'Join Chrome classroom' }).click();
    await learner.getByRole('button', { name: 'Join Chrome classroom' }).click();
    for (const page of [teacher, learner]) {
      await expect
        .poll(() => page.locator('section').innerText(), { timeout: 15_000 })
        .toContain('Connection: connected');
      await expect(page.getByRole('article')).toHaveCount(2);
      await expect(page.locator('video')).toHaveCount(0);
    }
    await expect(learner.getByRole('button', { name: 'Share screen' })).toHaveCount(0);
    await expect(teacher.getByRole('button', { name: 'Share screen' })).toBeVisible();
    await teacher.getByRole('button', { name: 'Enable camera' }).click();
    await expect
      .poll(() => teacher.locator('section').innerText(), { timeout: 15_000 })
      .toContain('Turn camera off');
    await teacher.getByRole('button', { name: 'Enable microphone' }).click();
    await expect.poll(() => teacher.locator('section').innerText()).toContain('Mute microphone');
    expect(errors).toEqual([]);
    await expect
      .poll(() =>
        learner
          .locator('video')
          .evaluateAll((videos) =>
            videos.some(
              (video) =>
                video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await expect
      .poll(async () => ({
        audio: await learner.locator('audio').evaluateAll((audios) =>
          audios.map((audio) => ({
            stream: audio instanceof HTMLAudioElement && audio.srcObject instanceof MediaStream,
            tracks:
              audio instanceof HTMLAudioElement && audio.srcObject instanceof MediaStream
                ? audio.srcObject.getAudioTracks().map((track) => track.readyState)
                : [],
          })),
        ),
        alerts: await teacher.getByRole('alert').allTextContents(),
        errors,
      }))
      .toMatchObject({ audio: [{ stream: true, tracks: ['live'] }], alerts: [], errors: [] });
    await learner.getByRole('button', { name: 'Enable camera' }).click();
    await expect
      .poll(() =>
        teacher
          .locator('video')
          .evaluateAll(
            (videos) =>
              videos.filter(
                (video) =>
                  video instanceof HTMLVideoElement &&
                  video.readyState >= 2 &&
                  video.videoWidth > 0,
              ).length,
          ),
      )
      .toBe(2);
    await teacher.getByRole('button', { name: 'Share screen' }).click();
    await expect(teacher.getByRole('button', { name: 'Stop sharing' })).toBeVisible();
    await expect(
      learner.getByRole('article', { name: 'teacher - screen', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        learner
          .getByRole('article', { name: 'teacher - screen', exact: true })
          .locator('video')
          .evaluateAll((videos) =>
            videos.some(
              (video) =>
                video instanceof HTMLVideoElement && video.readyState >= 2 && video.videoWidth > 0,
            ),
          ),
      )
      .toBe(true);
    await teacher.getByRole('button', { name: 'Stop sharing' }).click();
    await expect(
      learner.getByRole('article', { name: 'teacher - screen', exact: true }),
    ).toHaveCount(0);
    await learner.getByRole('button', { name: 'Leave classroom' }).click();
    await expect(teacher.getByRole('article')).toHaveCount(1);
    await teacher.getByRole('button', { name: 'Leave classroom' }).click();
    await expect(teacher.locator('video')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
