import { Injectable, signal } from '@angular/core';

/** Supported SCORM specification versions. */
export type ScormVersion = '1.2' | '2004';

/** Options for initializing the SCORM runtime. */
export interface ScormRuntimeOptions {
  /** SCORM specification version to use. */
  version: ScormVersion;
  /**
   * Initial CMI data to seed the SCORM API with.
   * Shape varies by version; pass as a plain key→value map.
   */
  initialCmi?: Record<string, unknown>;
  /**
   * Called whenever the SCORM API commits data.
   * Receives the current CMI state as a plain object.
   */
  persist: (cmi: Record<string, unknown>) => void | Promise<void>;
}

/**
 * SCORM runtime host service.
 *
 * Dynamically imports `scorm-again`, instantiates the correct API class onto
 * `window` (window.API for SCORM 1.2, window.API_1484_11 for SCORM 2004),
 * and wires commit/finish events to the provided `persist` callback.
 *
 * Emits completion status and score as Angular signals.
 */
@Injectable({ providedIn: 'root' })
export class ScormRuntimeService {
  /** Whether the learner has completed/finished the SCO. */
  readonly completed = signal(false);

  /** Scaled score [0–1], null if not yet reported. */
  readonly score = signal<number | null>(null);

  private _api: unknown = null;
  private _version: ScormVersion | null = null;
  private _opts: ScormRuntimeOptions | null = null;
  /** Detaches the event handlers registered in `initialize`. */
  private _detach: (() => void) | null = null;

  /**
   * Initialize the SCORM runtime.
   * Dynamically imports scorm-again, instantiates the API, and mounts it onto
   * window so that SCORM content inside an <iframe> can reach it.
   */
  async initialize(opts: ScormRuntimeOptions): Promise<void> {
    // Tear down any previous SCO so handlers/instances don't accumulate on the
    // root singleton across successive launches.
    if (this._api) this.terminate();

    this._opts = opts;
    this._version = opts.version;

    // A later SCO reuses this root-singleton service; clear any prior session's
    // status before seeding the new one so stale completion/score never leaks.
    this.completed.set(false);
    this.score.set(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('scorm-again');

    const settings = {
      autocommit: false,
      lmsCommitUrl: false as unknown as string, // disable HTTP commits — we handle via callback
    };

    if (opts.version === '1.2') {
      const api = new mod.Scorm12API(settings) as unknown as Scorm12APIShape;
      this._api = api;

      // Seed saved resume state (suspend_data/bookmark/status) BEFORE the SCO
      // loads. The iframe `src` is set later by `scorm-player`, so here is the
      // correct moment for the SCO to read the restored CMI on first access.
      this._seedResume(api, opts.initialCmi);

      // SCORM 1.2 mounts on window.API
      (window as WindowWithScorm).API = api;

      // Wire commit event — scorm-again fires "LMSCommit" on commit
      const onCommit = (): void => void this._handleCommit();
      const onFinish = (): void => void this._handleFinish();
      api.on('LMSCommit', onCommit);
      api.on('LMSFinish', onFinish);
      this._detach = () => {
        api.off?.('LMSCommit', onCommit);
        api.off?.('LMSFinish', onFinish);
      };
    } else {
      const api = new mod.Scorm2004API(settings) as unknown as Scorm2004APIShape;
      this._api = api;

      // Seed saved resume state BEFORE the SCO loads (see the 1.2 branch above).
      this._seedResume(api, opts.initialCmi);

      // SCORM 2004 mounts on window.API_1484_11
      (window as WindowWithScorm).API_1484_11 = api;

      // Wire commit event — scorm-again fires "Commit" on commit
      const onCommit = (): void => void this._handleCommit();
      const onTerminate = (): void => void this._handleFinish();
      api.on('Commit', onCommit);
      api.on('Terminate', onTerminate);
      this._detach = () => {
        api.off?.('Commit', onCommit);
        api.off?.('Terminate', onTerminate);
      };
    }
  }

  /**
   * Restore previously-saved CMI into the freshly-constructed API so the SCO
   * resumes at its saved bookmark/suspend_data (MO-09).
   *
   * `scorm-again`'s `BaseAPI` exposes `loadFromJSON(json)`; the matching producer
   * is `renderCMIToJSONObject()` (used by `saveCmi`), which returns a *nested*
   * shape `{ cmi: { core?, score?, ... } }`. `loadFromJSON` expects the inner CMI
   * object, so we unwrap the `cmi` key before loading. Guarded on a non-empty
   * object so a fresh enrolment (no saved state) is a no-op.
   *
   * There is no `datastring` setting in `scorm-again` — passing it is silently
   * ignored — which is why this explicit load is required.
   */
  private _seedResume(
    api: Scorm12APIShape | Scorm2004APIShape,
    initialCmi: Record<string, unknown> | undefined,
  ): void {
    if (!initialCmi) return;
    const nested = initialCmi['cmi'];
    const body = (nested && typeof nested === 'object' ? nested : initialCmi) as Record<
      string,
      unknown
    >;
    if (Object.keys(body).length === 0) return;
    api.loadFromJSON(body);
  }

  /** Tear down the SCORM runtime and remove the global API object. */
  terminate(): void {
    this._detach?.();
    this._detach = null;
    const win = window as WindowWithScorm;
    if (this._version === '1.2') {
      delete win.API;
    } else if (this._version === '2004') {
      delete win.API_1484_11;
    }
    this._api = null;
    this._version = null;
    this._opts = null;
    // Reset completion/score so a later SCO mounted on this root singleton does
    // not read the previous session's stale state (MO-09).
    this.completed.set(false);
    this.score.set(null);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _handleCommit(): Promise<void> {
    const cmi = this._extractCmi();
    if (this._opts?.persist) {
      await this._opts.persist(cmi);
    }
    this._updateSignals(cmi);
  }

  private async _handleFinish(): Promise<void> {
    const cmi = this._extractCmi();
    if (this._opts?.persist) {
      await this._opts.persist(cmi);
    }
    this._updateSignals(cmi);
    this.completed.set(true);
  }

  /** Extract the current CMI data as a plain object from the API instance. */
  private _extractCmi(): Record<string, unknown> {
    if (!this._api) return {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = this._api as any;
    if (typeof api.renderCMIToJSONObject === 'function') {
      return (api.renderCMIToJSONObject as () => Record<string, unknown>)();
    }
    return {};
  }

  /**
   * Update the scaled-score signal [0–1] from the extracted CMI.
   *
   * - SCORM 2004 exposes `cmi.score.scaled` already normalised to [0, 1].
   * - SCORM 1.2 exposes `cmi.core.score.raw` / `cmi.core.score.max` (typically
   *   0–100), so we compute `scaled = raw / max` (default max 100 when absent or
   *   non-positive) and clamp to [0, 1]. Previously the raw 1.2 value was written
   *   straight into the 0–1 `scaled` signal, so an 80/100 reported as 80.
   */
  private _updateSignals(cmi: Record<string, unknown>): void {
    const root = (cmi?.['cmi'] ?? {}) as Record<string, unknown>;

    // SCORM 2004: cmi.score.scaled (already 0–1).
    const score2004 = (root['score'] ?? {}) as Record<string, unknown>;
    const scaled2004 = toNumber(score2004['scaled']);
    if (scaled2004 !== null) {
      this.score.set(clamp01(scaled2004));
      return;
    }

    // SCORM 1.2: cmi.core.score.raw / cmi.core.score.max.
    const core = (root['core'] ?? {}) as Record<string, unknown>;
    const score12 = (core['score'] ?? {}) as Record<string, unknown>;
    const raw = toNumber(score12['raw']);
    if (raw !== null) {
      const max = toNumber(score12['max']);
      const denom = max !== null && max > 0 ? max : 100;
      this.score.set(clamp01(raw / denom));
    }
  }
}

/** Coerce a number-or-numeric-string to a finite number, else null. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const parsed = parseFloat(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Clamp to the [0, 1] range. */
function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------------------
// Local type shims (narrow interface so we don't need to import from scorm-again)
// ---------------------------------------------------------------------------

interface Scorm12APIShape {
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
  renderCMIToJSONObject(): Record<string, unknown>;
  /** Restore a CMI object (the inner `cmi` payload) for session resume. */
  loadFromJSON(json: Record<string, unknown>, CMIElement?: string): void;
}

interface Scorm2004APIShape {
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
  renderCMIToJSONObject(): Record<string, unknown>;
  /** Restore a CMI object (the inner `cmi` payload) for session resume. */
  loadFromJSON(json: Record<string, unknown>, CMIElement?: string): void;
}

interface WindowWithScorm {
  API?: Scorm12APIShape;
  API_1484_11?: Scorm2004APIShape;
}
