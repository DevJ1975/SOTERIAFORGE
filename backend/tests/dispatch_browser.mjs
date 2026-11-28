// A stand-in LMS (a real SCORM 1.2 runtime) plays the exported launcher, and a stand-in
// learner app reports progress to it. Reads {launcher, runtimePath, appOrigin, dispatchId}
// on stdin and prints what the LMS recorded.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input);
const runtime = await readFile(config.runtimePath);
const errors = [];
let lmsOrigin = '';
let appOrigin = '';

const page_ = (body) => `<!doctype html><html><body>${body}</body></html>`;
const lms = createServer((request, response) => {
  if (request.url === '/runtime.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(runtime);
  } else if (request.url === '/package/index.html') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(config.launcher.replaceAll(config.appOrigin, appOrigin));
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
      page_(`<script src="/runtime.js"></script><script>
window.API = new Scorm12API({ autocommit: false, lmsCommitUrl: "", logLevel: 5 });
</script><iframe id="sco" src="/package/index.html" style="width:100%;height:600px"></iframe>`),
    );
  }
});
// The learner app: reports whatever the test puts in the query string to its opener.
const app = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    page_(`<script>
window.report = (progressPct, completed, scorePct, origin, dispatchId) =>
  window.opener.postMessage(
    { type: "forge-dispatch", dispatchId, progressPct, completed, scorePct }, origin);
</script>`),
  );
});

const read = (page) =>
  page.evaluate(() => ({
    status: window.API.LMSGetValue('cmi.core.lesson_status'),
    score: window.API.LMSGetValue('cmi.core.score.raw'),
    location: window.API.LMSGetValue('cmi.core.lesson_location'),
  }));

let browser;
try {
  await new Promise((resolve) => lms.listen(0, '127.0.0.1', resolve));
  lmsOrigin = `http://127.0.0.1:${lms.address().port}`;
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  appOrigin = `http://127.0.0.1:${app.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(lmsOrigin);
  const sco = page.frameLocator('#sco');
  await sco.locator('#lms').filter({ hasText: 'Connected to your LMS.' }).waitFor();
  const started = await read(page);

  // A forged report from the LMS page itself (the wrong origin) changes nothing.
  await page.evaluate((dispatchId) => {
    document
      .getElementById('sco')
      .contentWindow.postMessage(
        { type: 'forge-dispatch', dispatchId, progressPct: 100, completed: true, scorePct: 100 },
        '*',
      );
  }, config.dispatchId);

  const [course] = await Promise.all([page.waitForEvent('popup'), sco.locator('#open').click()]);
  await course.waitForFunction(() => typeof window.report === 'function');
  assert.equal(new URL(course.url()).pathname, `/dispatch/${config.dispatchId}`);
  // Another export's report is ignored; this one's is recorded.
  await course.evaluate(([o]) => window.report(90, true, 99, o, 'someone-else'), [lmsOrigin]);
  await course.evaluate(
    ([o, id]) => window.report(67, false, null, o, id),
    [lmsOrigin, config.dispatchId],
  );
  await sco.locator('#status').filter({ hasText: 'Progress: 67%' }).waitFor();
  const partway = await read(page);
  await course.evaluate(
    ([o, id]) => window.report(100, true, 80, o, id),
    [lmsOrigin, config.dispatchId],
  );
  await sco.locator('#status').filter({ hasText: 'Course complete.' }).waitFor();
  const done = await read(page);
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ started, partway, done }));
} finally {
  if (browser) await browser.close();
  await Promise.all([
    new Promise((resolve) => lms.close(resolve)),
    new Promise((resolve) => app.close(resolve)),
  ]);
}
