import type { CanActivateFn, ParamMap } from '@angular/router';

/**
 * cmi5 launch state for a course another LMS opened (platform Phase 6).
 *
 * The LMS opens `/dispatch/:id?endpoint=…&fetch=…&actor=…&registration=…&activityId=…`.
 * The learner may have to sign in first, and then moves around the course, so the
 * parameters and what has already been sent live in sessionStorage for this tab.
 */
export interface Cmi5Launch {
  endpoint: string;
  fetch: string;
  /** The xAPI Agent exactly as the LMS supplied it. */
  actor: Record<string, unknown>;
  registration: string;
  activityId: string;
  /** From the single-use fetch URL. */
  token?: string;
  /** ISO time `initialized` was accepted; also the start of the reported duration. */
  initializedAt?: string;
  contextTemplate?: Record<string, unknown>;
  completedSent?: boolean;
  terminated?: boolean;
}

const key = (dispatchId: string) => `forge.dispatch.${dispatchId}`;

function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // storage blocked
  }
}

/** https only, apart from a developer's own machine. */
function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'https:' || (local && url.protocol === 'http:') ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The launch described by the query string, or null if any part is missing or unsafe. */
export function parseLaunch(params: Pick<ParamMap, 'get'>): Cmi5Launch | null {
  const endpoint = safeUrl(params.get('endpoint'));
  const fetchUrl = safeUrl(params.get('fetch'));
  const registration = params.get('registration');
  const activityId = params.get('activityId');
  let actor: unknown = null;
  try {
    actor = JSON.parse(params.get('actor') ?? 'null');
  } catch {
    actor = null;
  }
  if (!endpoint || !fetchUrl || !registration || !activityId) return null;
  if (!actor || typeof actor !== 'object' || Array.isArray(actor)) return null;
  return {
    endpoint: endpoint.endsWith('/') ? endpoint : `${endpoint}/`,
    fetch: fetchUrl,
    actor: actor as Record<string, unknown>,
    registration,
    activityId,
  };
}

export function readLaunch(dispatchId: string): Cmi5Launch | null {
  try {
    const raw = store()?.getItem(key(dispatchId));
    return raw ? (JSON.parse(raw) as Cmi5Launch) : null;
  } catch {
    return null;
  }
}

export function writeLaunch(dispatchId: string, launch: Cmi5Launch): void {
  try {
    store()?.setItem(key(dispatchId), JSON.stringify(launch));
  } catch {
    // Without storage the launch still works until the page reloads.
  }
}

/**
 * Keep a launch from the URL. A fetch URL we have already seen is the same launch
 * (the page reloaded or came back from sign-in), so its token and progress are kept.
 */
export function stashLaunch(dispatchId: string, params: Pick<ParamMap, 'get'>): void {
  const launch = parseLaunch(params);
  if (!launch) return;
  if (readLaunch(dispatchId)?.fetch === launch.fetch) return;
  writeLaunch(dispatchId, launch);
}

/** Runs before `authGuard`, so the launch survives the redirect to sign in. */
export const dispatchLaunchGuard: CanActivateFn = (route) => {
  const id = route.paramMap.get('id');
  if (id) stashLaunch(id, route.queryParamMap);
  return true;
};
