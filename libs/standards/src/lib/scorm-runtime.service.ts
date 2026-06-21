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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('scorm-again');

    const settings = {
      autocommit: false,
      lmsCommitUrl: false as unknown as string, // disable HTTP commits — we handle via callback
      ...(opts.initialCmi ? { datastring: JSON.stringify(opts.initialCmi) } : {}),
    };

    if (opts.version === '1.2') {
      const api = new mod.Scorm12API(settings) as unknown as Scorm12APIShape;
      this._api = api;

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

  /** Update score signal from the extracted CMI. */
  private _updateSignals(cmi: Record<string, unknown>): void {
    // SCORM 1.2: cmi.core.score.raw / max
    // SCORM 2004: cmi.score.scaled
    const cmiAny = cmi as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    const scaled =
      cmiAny?.['cmi']?.['score']?.['scaled'] ?? cmiAny?.['cmi']?.['core']?.['score']?.['raw'];
    if (typeof scaled === 'number') {
      this.score.set(scaled);
    } else if (typeof scaled === 'string') {
      const parsed = parseFloat(scaled);
      if (!isNaN(parsed)) {
        this.score.set(parsed);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Local type shims (narrow interface so we don't need to import from scorm-again)
// ---------------------------------------------------------------------------

interface Scorm12APIShape {
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
  renderCMIToJSONObject(): Record<string, unknown>;
}

interface Scorm2004APIShape {
  on(event: string, callback: () => void): void;
  off?(event: string, callback: () => void): void;
  renderCMIToJSONObject(): Record<string, unknown>;
}

interface WindowWithScorm {
  API?: Scorm12APIShape;
  API_1484_11?: Scorm2004APIShape;
}
