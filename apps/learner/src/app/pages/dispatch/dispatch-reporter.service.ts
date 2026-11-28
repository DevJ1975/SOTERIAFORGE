import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { StandardsApi, type DispatchSession } from '@assurance/standards';
import { filter } from 'rxjs';
import { type Cmi5Launch, readLaunch, writeLaunch } from './dispatch-launch';

export type DispatchLink = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** What the SCORM launcher in the LMS receives. */
export interface DispatchMessage {
  type: 'forge-dispatch';
  dispatchId: string;
  progressPct: number;
  completed: boolean;
  scorePct: number | null;
}

export const POLL_MS = 20_000;
const XAPI_VERSION = '1.0.3';
const CMI5_CATEGORY = 'https://w3id.org/xapi/cmi5/context/categories/cmi5';
const MOVEON_CATEGORY = 'https://w3id.org/xapi/cmi5/context/categories/moveon';
const VERBS = {
  initialized: 'http://adlnet.gov/expapi/verbs/initialized',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  terminated: 'http://adlnet.gov/expapi/verbs/terminated',
} as const;
type Verb = keyof typeof VERBS;

/** ISO 8601 duration to hundredths of a second, as cmi5 asks. */
export function isoDuration(ms: number): string {
  return `PT${(Math.max(0, ms) / 1000).toFixed(2).replace(/\.?0+$/, '')}S`;
}

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** The statement context: the LMS's template plus the registration and cmi5 categories. */
export function statementContext(launch: Cmi5Launch, verb: Verb): Record<string, unknown> {
  const template = launch.contextTemplate ?? {};
  const activities = (template['contextActivities'] ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(activities['category']) ? activities['category'] : [];
  const category = [...existing, { id: CMI5_CATEGORY }];
  if (verb === 'completed') category.push({ id: MOVEON_CATEGORY });
  return {
    ...template,
    registration: launch.registration,
    contextActivities: { ...activities, category },
  };
}

export function buildStatement(launch: Cmi5Launch, verb: Verb, now: Date): Record<string, unknown> {
  const statement: Record<string, unknown> = {
    id: uuid(),
    actor: launch.actor,
    verb: { id: VERBS[verb], display: { 'en-US': verb } },
    object: { objectType: 'Activity', id: launch.activityId },
    context: statementContext(launch, verb),
    timestamp: now.toISOString(),
  };
  if (verb === 'completed' || verb === 'terminated') {
    const started = launch.initializedAt ? Date.parse(launch.initializedAt) : now.getTime();
    const duration = isoDuration(now.getTime() - started);
    statement['result'] = verb === 'completed' ? { completion: true, duration } : { duration };
  }
  return statement;
}

/**
 * Reports a learner's progress in a dispatched course back to the LMS that launched it
 * (platform Phase 6). Root-provided so it keeps running while the learner works through
 * the course in this window.
 *
 * - SCORM 1.2: posts to the launcher window, only at the origins staff registered.
 * - cmi5: Forge is the Assignable Unit and writes xAPI straight to the LMS, with
 *   `fetch` rather than HttpClient so no Forge cookie or header ever goes there.
 */
@Injectable({ providedIn: 'root' })
export class DispatchReporter {
  private readonly api = inject(StandardsApi);
  private readonly router = inject(Router);
  private readonly window = inject(DOCUMENT).defaultView;

  readonly session = signal<DispatchSession | null>(null);
  readonly link = signal<DispatchLink>('idle');
  /** Why reporting is not connected, in words for the learner. */
  readonly problem = signal('');

  private dispatchId: string | null = null;
  private lastReported: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private watching = false;
  private ticking: Promise<void> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** Start (or resume) reporting for a dispatch. Rejects if the session can't be read. */
  async activate(dispatchId: string): Promise<void> {
    if (this.dispatchId !== dispatchId) {
      this.stop();
      this.dispatchId = dispatchId;
      this.lastReported = null;
      this.session.set(null);
      this.link.set('idle');
    }
    const session = await this.api.dispatchSession(dispatchId);
    this.session.set(session);
    await this.connect(session);
    this.watch();
    await this.report(session);
  }

  /** Try the LMS connection again after a failure. */
  async retry(): Promise<void> {
    const session = this.session();
    if (!session) return;
    await this.connect(session);
    this.lastReported = null;
    await this.report(session);
  }

  /** Re-read the session and report if anything changed. Overlapping calls share one read. */
  tick(): Promise<void> {
    this.ticking ??= this.refresh().finally(() => (this.ticking = null));
    return this.ticking;
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.dispatchId = null;
  }

  private async refresh(): Promise<void> {
    const id = this.dispatchId;
    if (!id) return;
    let session: DispatchSession;
    try {
      session = await this.api.dispatchSession(id);
    } catch {
      return; // offline or signed out; the next tick tries again
    }
    if (this.dispatchId !== id) return;
    this.session.set(session);
    await this.report(session);
  }

  private watch(): void {
    if (this.timer === null) this.timer = setInterval(() => void this.tick(), POLL_MS);
    if (this.watching) return;
    this.watching = true;
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => void this.tick());
    this.window?.addEventListener('pagehide', () => this.terminate());
  }

  private fail(problem: string): void {
    this.link.set('disconnected');
    this.problem.set(problem);
  }

  private async connect(session: DispatchSession): Promise<void> {
    this.problem.set('');
    if (!session.enrolled) {
      this.fail('You are not enrolled in this course yet.');
      return;
    }
    if (session.format === 'scorm12') {
      if (!this.window?.opener || !session.lmsOrigins.length) {
        this.fail('Open this course from your LMS so your progress can be sent back to it.');
        return;
      }
      this.link.set('connected');
      return;
    }
    await this.connectCmi5(session.dispatchId);
  }

  private async connectCmi5(dispatchId: string): Promise<void> {
    const launch = readLaunch(dispatchId);
    if (!launch) {
      this.fail('Open this course from your LMS so your progress can be sent back to it.');
      return;
    }
    if (launch.terminated) {
      this.fail('This LMS session has ended. Open the course from your LMS again.');
      return;
    }
    this.link.set('connecting');
    try {
      if (!launch.token) {
        launch.token = await this.fetchToken(launch);
        writeLaunch(dispatchId, launch);
      }
      if (!launch.initializedAt) {
        launch.contextTemplate = await this.launchData(launch);
        const now = new Date();
        await this.send(launch, buildStatement(launch, 'initialized', now));
        launch.initializedAt = now.toISOString();
        writeLaunch(dispatchId, launch);
      }
      this.link.set('connected');
    } catch {
      this.fail('Could not reach your LMS. Your progress here is still saved.');
    }
  }

  /** The fetch URL works once, so the token is stored as soon as it arrives. */
  private async fetchToken(launch: Cmi5Launch): Promise<string> {
    const response = await fetch(launch.fetch, { method: 'POST', credentials: 'omit' });
    const body: unknown = response.ok ? await response.json() : null;
    const token =
      body && typeof body === 'object' ? (body as Record<string, unknown>)['auth-token'] : null;
    if (typeof token !== 'string' || !token) throw new Error('No auth-token from the LMS.');
    return token;
  }

  private headers(launch: Cmi5Launch): Record<string, string> {
    return {
      Authorization: `Basic ${launch.token}`,
      'X-Experience-API-Version': XAPI_VERSION,
    };
  }

  private async launchData(launch: Cmi5Launch): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({
      stateId: 'LMS.LaunchData',
      activityId: launch.activityId,
      agent: JSON.stringify(launch.actor),
      registration: launch.registration,
    });
    const response = await fetch(`${launch.endpoint}activities/state?${query}`, {
      headers: this.headers(launch),
      credentials: 'omit',
    });
    if (!response.ok) throw new Error('No launch data from the LMS.');
    const data: unknown = await response.json();
    const template =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>)['contextTemplate']
        : null;
    return template && typeof template === 'object' ? (template as Record<string, unknown>) : {};
  }

  private async send(
    launch: Cmi5Launch,
    statement: Record<string, unknown>,
    keepalive = false,
  ): Promise<void> {
    const response = await fetch(`${launch.endpoint}statements`, {
      method: 'POST',
      headers: { ...this.headers(launch), 'Content-Type': 'application/json' },
      body: JSON.stringify(statement),
      credentials: 'omit',
      keepalive,
    });
    if (!response.ok) throw new Error(`The LMS refused the statement (${response.status}).`);
  }

  private async report(session: DispatchSession): Promise<void> {
    if (this.link() !== 'connected') return;
    const state = `${session.progressPct}|${session.completed}|${session.scorePct}`;
    if (state === this.lastReported) return;
    if (session.format === 'scorm12') {
      const message: DispatchMessage = {
        type: 'forge-dispatch',
        dispatchId: session.dispatchId,
        progressPct: session.progressPct,
        completed: session.completed,
        scorePct: session.scorePct,
      };
      const opener = this.window?.opener as Window | null | undefined;
      if (!opener) {
        this.fail('The LMS window was closed. Open the course from your LMS again.');
        return;
      }
      // Never '*': a window at any other origin gets nothing.
      for (const origin of session.lmsOrigins) opener.postMessage(message, origin);
      this.lastReported = state;
      return;
    }
    const launch = readLaunch(session.dispatchId);
    if (!launch?.token || launch.terminated) return;
    if (session.completed && !launch.completedSent) {
      // Marked before sending so a second tick can never send it twice.
      launch.completedSent = true;
      writeLaunch(session.dispatchId, launch);
      try {
        await this.send(launch, buildStatement(launch, 'completed', new Date()));
      } catch {
        launch.completedSent = false;
        writeLaunch(session.dispatchId, launch);
        this.fail('Could not reach your LMS. Your progress here is still saved.');
        return;
      }
    }
    this.lastReported = state;
  }

  /** cmi5 only: the last statement of the session, sent as the page goes away. */
  private terminate(): void {
    const id = this.dispatchId;
    if (!id || this.session()?.format !== 'cmi5') return;
    const launch = readLaunch(id);
    if (!launch?.token || !launch.initializedAt || launch.terminated) return;
    launch.terminated = true;
    writeLaunch(id, launch);
    void this.send(launch, buildStatement(launch, 'terminated', new Date()), true).catch(
      () => undefined,
    );
  }
}
