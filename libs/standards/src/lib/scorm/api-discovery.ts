/**
 * SCORM API discovery installation.
 *
 * Per the IMS/ADL API discovery algorithm, SCO content locates its runtime by
 * walking up the frame hierarchy from its own window: it checks each
 * `window.parent` (and finally `window.opener`, then the opener's parents)
 * for a global named `API` (SCORM 1.2) or `API_1484_11` (SCORM 2004) and uses
 * the first one found.
 *
 * Our player loads the SCO in an iframe, so installing the API on the
 * *player's own* window — which is the iframe's `parent` — places it exactly
 * where the very first step of the discovery walk looks. Nothing has to be
 * injected into the content document itself, which keeps cross-origin and
 * sandboxed launches working.
 */
import type { Scorm12Api, Scorm2004Api } from './scorm-api';

/** The two SCORM dialects we can install. */
export type ScormVersion = '1.2' | '2004';

/** Global names mandated by the discovery algorithm, keyed by version. */
export const SCORM_GLOBAL_NAMES: Record<ScormVersion, 'API' | 'API_1484_11'> = {
  '1.2': 'API',
  '2004': 'API_1484_11',
};

interface ScormHostWindow {
  API?: Scorm12Api;
  API_1484_11?: Scorm2004Api;
}

/**
 * Exposes `api` on `target` under the standard global name for `version`
 * (`API` for 1.2, `API_1484_11` for 2004). Install on the window that is the
 * content iframe's parent *before* the iframe starts loading, so the SCO's
 * discovery walk finds it on its first hop.
 */
export function installScormApi(
  target: Window,
  api: Scorm12Api | Scorm2004Api,
  version: ScormVersion,
): void {
  const host = target as Window & ScormHostWindow;
  if (version === '1.2') host.API = api as Scorm12Api;
  else host.API_1484_11 = api as Scorm2004Api;
}

/** Removes the global installed by {@link installScormApi}, if present. */
export function removeScormApi(target: Window, version: ScormVersion): void {
  const host = target as Window & ScormHostWindow;
  if (version === '1.2') delete host.API;
  else delete host.API_1484_11;
}

/** Returns the API currently installed on `target` for `version`, if any. */
export function getInstalledScormApi(
  target: Window,
  version: ScormVersion,
): Scorm12Api | Scorm2004Api | undefined {
  const host = target as Window & ScormHostWindow;
  return version === '1.2' ? host.API : host.API_1484_11;
}
