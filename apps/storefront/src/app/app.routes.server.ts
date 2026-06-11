import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * Per-route render modes:
 *
 * - ''        — fully static marketing page, prerendered at build time.
 * - 'catalog' — server-rendered shell (hero copy, headings, loading
 *               skeletons) so the marketing content is crawlable; product
 *               data streams in client-side from Firestore.
 * - 'login'   — server-renderable static form shell.
 * - 'thanks' / 'library' — client-only: both depend on the signed-in user
 *               (claims refresh, entitlements), which only exists in the
 *               browser (the server bootstrap has no Firebase).
 */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'catalog', renderMode: RenderMode.Server },
  { path: 'login', renderMode: RenderMode.Server },
  { path: 'thanks', renderMode: RenderMode.Client },
  { path: 'library', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server },
];
