import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const config = JSON.parse(input);
const runtime = await readFile(config.runtimePath);
const commits = [];
const errors = [];
let contentOrigin = '';
let appOrigin = '';
const SCO = `<!doctype html><html><body>
<p id="entry"></p><button id="save">Bookmark</button><button id="complete">Complete</button>
<button id="exit">Exit</button><script>
const version = ${JSON.stringify(config.version)};
const api = parent[version === "1.2" ? "API" : "API_1484_11"];
const init = version === "1.2" ? "LMSInitialize" : "Initialize";
const get = version === "1.2" ? "LMSGetValue" : "GetValue";
const set = version === "1.2" ? "LMSSetValue" : "SetValue";
const commit = version === "1.2" ? "LMSCommit" : "Commit";
const finish = version === "1.2" ? "LMSFinish" : "Terminate";
api[init]("");
document.getElementById("entry").textContent = api[get]("cmi.suspend_data");
document.getElementById("save").onclick = () => {
  api[set]("cmi.suspend_data", "page=2");
  api[set](version === "1.2" ? "cmi.core.lesson_status" : "cmi.completion_status", "incomplete");
  api[commit]("");
};
document.getElementById("complete").onclick = () => {
  api[set](version === "1.2" ? "cmi.core.lesson_status" : "cmi.completion_status", "completed");
  api[commit]("");
};
document.getElementById("exit").onclick = () => api[finish]("");
</script></body></html>`;

const content = createServer((request, response) => {
  if (request.url === '/runtime.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(runtime);
  } else if (request.url.endsWith('/files/index.html')) {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(SCO);
  } else if (request.url === '/launch/test/') {
    response.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': config.csp.replaceAll('http://127.0.0.1:__PORT__', appOrigin),
    });
    response.end(config.html.replaceAll('http://127.0.0.1:__PORT__', appOrigin));
  } else {
    response.writeHead(404);
    response.end();
  }
});
const app = createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><html><body>
<iframe id="wrapper" sandbox="allow-scripts allow-same-origin allow-forms"
 src="${contentOrigin}/launch/test/" style="width:100%;height:800px"></iframe>
<script>
window.commits = [];
const frame = document.getElementById("wrapper");
window.addEventListener("message", event => {
  if (event.origin !== ${JSON.stringify(contentOrigin)} || event.source !== frame.contentWindow) return;
  const message = event.data;
  if (message.type === "forge.scorm.ready") {
    frame.contentWindow.postMessage({type:"forge.scorm.connect", launchId:message.launchId}, event.origin);
  } else if (message.type === "forge.scorm.commit") {
    window.commits.push(message);
    frame.contentWindow.postMessage({
      type:"forge.scorm.ack", launchId:message.launchId, sequence:message.sequence
    }, event.origin);
  }
});
</script></body></html>`);
});

let browser;
try {
  await new Promise((resolve) => content.listen(0, '127.0.0.1', resolve));
  contentOrigin = `http://127.0.0.1:${content.address().port}`;
  await new Promise((resolve) => app.listen(0, '127.0.0.1', resolve));
  appOrigin = `http://127.0.0.1:${app.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(appOrigin);
  const sco = page.frameLocator('#wrapper').frameLocator('#sco');
  await sco.locator('#save').waitFor();
  assert.equal(await sco.locator('#entry').textContent(), config.resume ? 'page=2' : '');
  if (config.resume) await sco.locator('#complete').click();
  else await sco.locator('#save').click();
  await page.waitForFunction(() => window.commits.length > 0);
  if (!config.resume) await sco.locator('#exit').click();
  await page
    .frameLocator('#wrapper')
    .locator('#status')
    .filter({ hasText: 'Progress saved.' })
    .waitFor();
  commits.push(...(await page.evaluate(() => window.commits)));
  assert.deepEqual(errors, []);
  process.stdout.write(JSON.stringify({ commits, errors }));
} finally {
  if (browser) await browser.close();
  await Promise.all([
    new Promise((resolve) => content.close(resolve)),
    new Promise((resolve) => app.close(resolve)),
  ]);
}
