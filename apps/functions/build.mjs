// Bundle the Cloud Functions with the esbuild JS API, invoked via `node`
// (always on PATH) to avoid CI shell/PATH/npx resolution issues. Workspace
// libs (@forge/*) are inlined; npm deps stay external (declared in package.json).
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/functions/src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'apps/functions/lib/index.js',
  packages: 'external',
  tsconfig: 'tsconfig.base.json',
  sourcemap: true,
  logLevel: 'info',
});
