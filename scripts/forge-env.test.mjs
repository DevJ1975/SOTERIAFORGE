// node --test scripts/*.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { environmentFile } from './forge-env.mjs';

const parse = (contents) =>
  JSON.parse(contents.slice(contents.indexOf('= {') + 2).replace(/;\s*$/, ''));

test('writes the API and root domain when FORGE_API_BASE_URL is set, off Vercel', () => {
  const result = environmentFile('learner', {
    FORGE_API_BASE_URL: ' https://api.staging.soteriaforge.com/// ',
    FORGE_ROOT_DOMAIN: 'staging.soteriaforge.com',
  });
  assert.equal(result.file, 'apps/learner/src/environments/environment.ts');
  assert.deepEqual(parse(result.contents), {
    production: true,
    apiBaseUrl: 'https://api.staging.soteriaforge.com',
    rootDomain: 'staging.soteriaforge.com',
  });
  assert.match(result.contents, /AssuranceEnvironment/);
});

test('defaults the root domain', () => {
  const result = environmentFile('admin', { FORGE_API_BASE_URL: 'https://api.soteriaforge.com' });
  assert.equal(parse(result.contents).rootDomain, 'soteriaforge.com');
});

test('keeps the committed file when nothing is set off Vercel', () => {
  assert.equal(environmentFile('learner', {}), null);
  assert.equal(environmentFile('learner', { FORGE_API_BASE_URL: '   ' }), null);
});

test('fails the build on Vercel without an API URL', () => {
  assert.throws(() => environmentFile('learner', { VERCEL: '1' }), /FORGE_API_BASE_URL/);
});

test('rejects an API URL without a scheme', () => {
  assert.throws(
    () => environmentFile('learner', { FORGE_API_BASE_URL: 'api.soteriaforge.com' }),
    /https:\/\//,
  );
});

test('storefront takes only the root domain and keeps its own type', () => {
  assert.equal(environmentFile('storefront', { FORGE_API_BASE_URL: 'https://x.test' }), null);
  const result = environmentFile('storefront', { FORGE_ROOT_DOMAIN: 'staging.soteriaforge.com' });
  assert.match(result.contents, /StorefrontEnvironment/);
  assert.deepEqual(parse(result.contents), {
    production: true,
    rootDomain: 'staging.soteriaforge.com',
    contactEmail: 'hello@soteriaforge.com',
  });
});
