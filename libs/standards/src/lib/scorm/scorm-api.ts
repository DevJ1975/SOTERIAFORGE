/**
 * Framework-free SCORM runtime APIs — the objects courseware exported from
 * Articulate Storyline, Rise, Captivate, iSpring, etc. calls into.
 *
 * `createScorm12Api` returns the SCORM 1.2 runtime (`LMSInitialize`,
 * `LMSGetValue`, …) and `createScorm2004Api` the SCORM 2004 3rd/4th-edition
 * runtime (`Initialize`, `GetValue`, …). Both are backed by an in-memory CMI
 * store seeded from `opts.initialCmi`; the host persists state via
 * `opts.onCommit` and reacts to progress via `opts.onStatusChange`.
 *
 * ## Supported CMI elements
 *
 * The common subset real content actually uses is implemented with correct
 * access control and validation; anything else returns "not implemented" /
 * "undefined element" (1.2: `401`, 2004: `401`).
 *
 * ### SCORM 1.2
 * | Element                     | Access | Notes                                          |
 * |-----------------------------|--------|------------------------------------------------|
 * | cmi.core._children          | RO     | comma list of supported core children          |
 * | cmi.core.student_id         | RO     | seeded from `opts.learnerId`                   |
 * | cmi.core.student_name       | RO     | seeded from `opts.learnerName`                 |
 * | cmi.core.lesson_location    | RW     | bookmark, ≤ 255 chars                          |
 * | cmi.core.credit             | RO     | defaults to `credit`                           |
 * | cmi.core.lesson_status      | RW     | passed/completed/failed/incomplete/browsed/not attempted |
 * | cmi.core.entry              | RO     | `ab-initio`, or `resume` when state was seeded |
 * | cmi.core.score._children    | RO     | `raw,min,max`                                  |
 * | cmi.core.score.raw          | RW     | decimal 0–100                                  |
 * | cmi.core.score.min          | RW     | decimal 0–100                                  |
 * | cmi.core.score.max          | RW     | decimal 0–100                                  |
 * | cmi.core.total_time         | RO     | `HH:MM:SS[.SS]`, accumulated on LMSFinish      |
 * | cmi.core.lesson_mode        | RO     | defaults to `normal`                           |
 * | cmi.core.exit               | WO     | time-out/suspend/logout/''                     |
 * | cmi.core.session_time       | WO     | `HH:MM:SS[.SS]`                                |
 * | cmi.suspend_data            | RW     | ≤ 4096 chars                                   |
 * | cmi.launch_data             | RO     | seeded via `initialCmi`                        |
 * | cmi.comments                | RW     | free text                                      |
 * | cmi.comments_from_lms       | RO     | seeded via `initialCmi`                        |
 *
 * ### SCORM 2004
 * | Element                     | Access | Notes                                          |
 * |-----------------------------|--------|------------------------------------------------|
 * | cmi._version                | RO     | `1.0`                                          |
 * | cmi.learner_id              | RO     | seeded from `opts.learnerId`                   |
 * | cmi.learner_name            | RO     | seeded from `opts.learnerName`                 |
 * | cmi.location                | RW     | bookmark, ≤ 1000 chars                         |
 * | cmi.completion_status       | RW     | completed/incomplete/not attempted/unknown     |
 * | cmi.success_status          | RW     | passed/failed/unknown                          |
 * | cmi.credit                  | RO     | defaults to `credit`                           |
 * | cmi.mode                    | RO     | defaults to `normal`                           |
 * | cmi.entry                   | RO     | `ab-initio`, or `resume` when state was seeded |
 * | cmi.score._children         | RO     | `scaled,raw,min,max`                           |
 * | cmi.score.scaled            | RW     | decimal −1…1                                   |
 * | cmi.score.raw               | RW     | decimal                                        |
 * | cmi.score.min               | RW     | decimal                                        |
 * | cmi.score.max               | RW     | decimal                                        |
 * | cmi.progress_measure        | RW     | decimal 0…1                                    |
 * | cmi.total_time              | RO     | ISO 8601 duration, accumulated on Terminate    |
 * | cmi.session_time            | WO     | ISO 8601 duration                              |
 * | cmi.exit                    | WO     | time-out/suspend/logout/normal/''              |
 * | cmi.suspend_data            | RW     | ≤ 64000 chars                                  |
 * | cmi.launch_data             | RO     | seeded via `initialCmi`                        |
 * | cmi.scaled_passing_score    | RO     | seeded via `initialCmi`                        |
 * | cmi.completion_threshold    | RO     | seeded via `initialCmi`                        |
 *
 * ## Error codes implemented
 * - 1.2: `0` no error, `101` general exception (re-init / init after finish),
 *   `201` invalid argument, `301` not initialized (also used after LMSFinish —
 *   1.2 has no dedicated post-finish codes), `401` not implemented, `402`
 *   keyword set, `403` read only, `404` write only, `405` incorrect data type
 *   (also used for out-of-range and oversized values — 1.2 has no own codes).
 * - 2004: `0`, `103` already initialized, `104` content instance terminated,
 *   `112`/`113` terminate before init / after termination, `122`/`123` get
 *   before init / after termination, `132`/`133` set, `142`/`143` commit,
 *   `201` argument error, `351` general set failure (suspend_data over SPM),
 *   `401` undefined element, `403` value not initialized, `404` read only,
 *   `405` write only, `406` type mismatch, `407` out of range.
 */
import { flattenCmi } from './cmi-serialize';
import {
  formatScorm12Time,
  formatScorm2004Duration,
  parseScorm12Time,
  parseScorm2004Duration,
} from './scorm-time';

/** SCORM API methods return the strings 'true'/'false', never booleans. */
export type ScormBoolean = 'true' | 'false';

/** Snapshot pushed through `onStatusChange` whenever progress moves. */
export interface ScormStatusChange {
  /** 1.2: lesson_status is completed/passed · 2004: completion_status is completed. */
  completed: boolean;
  /** Defined once a pass/fail judgement exists; undefined while unknown. */
  passed?: boolean;
  /** Raw score as a number, once the content has reported one. */
  scoreRaw?: number;
}

export interface ScormApiOptions {
  /**
   * Seed CMI state, e.g. a previously committed attempt. Accepts either a
   * flat map (`{'cmi.suspend_data': '…'}`) or a nested record; unknown
   * elements are ignored. When suspend_data or the location bookmark is
   * seeded, `entry` reports `resume` instead of `ab-initio`.
   */
  initialCmi?: Record<string, unknown>;
  /** Exposed as cmi.core.student_id (1.2) / cmi.learner_id (2004). */
  learnerId?: string;
  /** Exposed as cmi.core.student_name (1.2) / cmi.learner_name (2004). */
  learnerName?: string;
  /** Fires on Commit and on Finish/Terminate with the full flat CMI map. */
  onCommit?: (cmi: Record<string, string>) => void;
  /** Fires whenever completion/success status or the raw score changes. */
  onStatusChange?: (change: ScormStatusChange) => void;
}

/** The SCORM 1.2 runtime API content discovers as `window.API`. */
export interface Scorm12Api {
  LMSInitialize(param: string): ScormBoolean;
  LMSFinish(param: string): ScormBoolean;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): ScormBoolean;
  LMSCommit(param: string): ScormBoolean;
  LMSGetLastError(): string;
  LMSGetErrorString(errorCode: string): string;
  LMSGetDiagnostic(errorCode: string): string;
}

/** The SCORM 2004 runtime API content discovers as `window.API_1484_11`. */
export interface Scorm2004Api {
  Initialize(param: string): ScormBoolean;
  Terminate(param: string): ScormBoolean;
  GetValue(element: string): string;
  SetValue(element: string, value: string): ScormBoolean;
  Commit(param: string): ScormBoolean;
  GetLastError(): string;
  GetErrorString(errorCode: string): string;
  GetDiagnostic(errorCode: string): string;
}

// ---------------------------------------------------------------------------
// Data model definitions
// ---------------------------------------------------------------------------

type Access = 'rw' | 'ro' | 'wo';
type ValidationResult = 'ok' | 'type' | 'range' | 'too-long';

interface ElementDef {
  access: Access;
  validate?: (value: string) => ValidationResult;
  /** Successful writes recompute the status snapshot. */
  statusElement?: boolean;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

const vocab =
  (...allowed: string[]) =>
  (value: string): ValidationResult =>
    allowed.includes(value) ? 'ok' : 'type';

const decimal =
  (min?: number, max?: number) =>
  (value: string): ValidationResult => {
    if (!DECIMAL.test(value.trim())) return 'type';
    const n = Number(value);
    if ((min !== undefined && n < min) || (max !== undefined && n > max)) return 'range';
    return 'ok';
  };

const maxLength =
  (limit: number) =>
  (value: string): ValidationResult =>
    value.length <= limit ? 'ok' : 'too-long';

const timespan12 = (value: string): ValidationResult =>
  parseScorm12Time(value) === null ? 'type' : 'ok';

const duration2004 = (value: string): ValidationResult =>
  parseScorm2004Duration(value) === null ? 'type' : 'ok';

const SCORM12_MODEL: Record<string, ElementDef> = {
  'cmi.core._children': { access: 'ro' },
  'cmi.core.student_id': { access: 'ro' },
  'cmi.core.student_name': { access: 'ro' },
  'cmi.core.lesson_location': { access: 'rw', validate: maxLength(255) },
  'cmi.core.credit': { access: 'ro' },
  'cmi.core.lesson_status': {
    access: 'rw',
    statusElement: true,
    validate: vocab('passed', 'completed', 'failed', 'incomplete', 'browsed', 'not attempted'),
  },
  'cmi.core.entry': { access: 'ro' },
  'cmi.core.score._children': { access: 'ro' },
  'cmi.core.score.raw': { access: 'rw', statusElement: true, validate: decimal(0, 100) },
  'cmi.core.score.min': { access: 'rw', validate: decimal(0, 100) },
  'cmi.core.score.max': { access: 'rw', validate: decimal(0, 100) },
  'cmi.core.total_time': { access: 'ro' },
  'cmi.core.lesson_mode': { access: 'ro' },
  'cmi.core.exit': { access: 'wo', validate: vocab('time-out', 'suspend', 'logout', '') },
  'cmi.core.session_time': { access: 'wo', validate: timespan12 },
  'cmi.suspend_data': { access: 'rw', validate: maxLength(4096) },
  'cmi.launch_data': { access: 'ro' },
  'cmi.comments': { access: 'rw' },
  'cmi.comments_from_lms': { access: 'ro' },
};

const SCORM12_DEFAULTS: Record<string, string> = {
  'cmi.core._children':
    'student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time',
  'cmi.core.score._children': 'raw,min,max',
  'cmi.core.lesson_status': 'not attempted',
  'cmi.core.credit': 'credit',
  'cmi.core.lesson_mode': 'normal',
  'cmi.core.entry': 'ab-initio',
  'cmi.core.total_time': '00:00:00',
};

const SCORM2004_MODEL: Record<string, ElementDef> = {
  'cmi._version': { access: 'ro' },
  'cmi.learner_id': { access: 'ro' },
  'cmi.learner_name': { access: 'ro' },
  'cmi.location': { access: 'rw', validate: maxLength(1000) },
  'cmi.completion_status': {
    access: 'rw',
    statusElement: true,
    validate: vocab('completed', 'incomplete', 'not attempted', 'unknown'),
  },
  'cmi.success_status': {
    access: 'rw',
    statusElement: true,
    validate: vocab('passed', 'failed', 'unknown'),
  },
  'cmi.credit': { access: 'ro' },
  'cmi.mode': { access: 'ro' },
  'cmi.entry': { access: 'ro' },
  'cmi.score._children': { access: 'ro' },
  'cmi.score.scaled': { access: 'rw', statusElement: true, validate: decimal(-1, 1) },
  'cmi.score.raw': { access: 'rw', statusElement: true, validate: decimal() },
  'cmi.score.min': { access: 'rw', validate: decimal() },
  'cmi.score.max': { access: 'rw', validate: decimal() },
  'cmi.progress_measure': { access: 'rw', validate: decimal(0, 1) },
  'cmi.total_time': { access: 'ro' },
  'cmi.session_time': { access: 'wo', validate: duration2004 },
  'cmi.exit': { access: 'wo', validate: vocab('time-out', 'suspend', 'logout', 'normal', '') },
  'cmi.suspend_data': { access: 'rw', validate: maxLength(64000) },
  'cmi.launch_data': { access: 'ro' },
  'cmi.scaled_passing_score': { access: 'ro' },
  'cmi.completion_threshold': { access: 'ro' },
};

const SCORM2004_DEFAULTS: Record<string, string> = {
  'cmi._version': '1.0',
  'cmi.score._children': 'scaled,raw,min,max',
  'cmi.completion_status': 'unknown',
  'cmi.success_status': 'unknown',
  'cmi.credit': 'credit',
  'cmi.mode': 'normal',
  'cmi.entry': 'ab-initio',
  'cmi.total_time': 'PT0S',
};

// ---------------------------------------------------------------------------
// Error tables
// ---------------------------------------------------------------------------

const SCORM12_ERRORS: Record<string, string> = {
  '0': 'No error',
  '101': 'General exception',
  '201': 'Invalid argument error',
  '301': 'Not initialized',
  '401': 'Not implemented error',
  '402': 'Invalid set value, element is a keyword',
  '403': 'Element is read only',
  '404': 'Element is write only',
  '405': 'Incorrect data type',
};

const SCORM2004_ERRORS: Record<string, string> = {
  '0': 'No Error',
  '101': 'General Exception',
  '103': 'Already Initialized',
  '104': 'Content Instance Terminated',
  '112': 'Termination Before Initialization',
  '113': 'Termination After Termination',
  '122': 'Retrieve Data Before Initialization',
  '123': 'Retrieve Data After Termination',
  '132': 'Store Data Before Initialization',
  '133': 'Store Data After Termination',
  '142': 'Commit Before Initialization',
  '143': 'Commit After Termination',
  '201': 'General Argument Error',
  '301': 'General Get Failure',
  '351': 'General Set Failure',
  '391': 'General Commit Failure',
  '401': 'Undefined Data Model Element',
  '403': 'Data Model Element Value Not Initialized',
  '404': 'Data Model Element Is Read Only',
  '405': 'Data Model Element Is Write Only',
  '406': 'Data Model Element Type Mismatch',
  '407': 'Data Model Element Value Out Of Range',
};

/**
 * Where the two dialects disagree on which code a situation maps to. 1.2 has
 * far fewer codes, so several situations collapse onto 301/405 there.
 */
interface ErrorMap {
  alreadyInitialized: string;
  initializeAfterTermination: string;
  getBeforeInitialization: string;
  getAfterTermination: string;
  setBeforeInitialization: string;
  setAfterTermination: string;
  commitBeforeInitialization: string;
  commitAfterTermination: string;
  terminateBeforeInitialization: string;
  terminateAfterTermination: string;
  invalidArgument: string;
  undefinedElement: string;
  keywordSet: string;
  readOnly: string;
  writeOnly: string;
  typeMismatch: string;
  outOfRange: string;
  tooLong: string;
  valueNotInitialized: string | null;
}

const SCORM12_ERROR_MAP: ErrorMap = {
  alreadyInitialized: '101',
  initializeAfterTermination: '101',
  getBeforeInitialization: '301',
  getAfterTermination: '301',
  setBeforeInitialization: '301',
  setAfterTermination: '301',
  commitBeforeInitialization: '301',
  commitAfterTermination: '301',
  terminateBeforeInitialization: '301',
  terminateAfterTermination: '301',
  invalidArgument: '201',
  undefinedElement: '401',
  keywordSet: '402',
  readOnly: '403',
  writeOnly: '404',
  typeMismatch: '405',
  outOfRange: '405',
  tooLong: '405',
  valueNotInitialized: null, // 1.2 returns '' with no error for vacant elements
};

const SCORM2004_ERROR_MAP: ErrorMap = {
  alreadyInitialized: '103',
  initializeAfterTermination: '104',
  getBeforeInitialization: '122',
  getAfterTermination: '123',
  setBeforeInitialization: '132',
  setAfterTermination: '133',
  commitBeforeInitialization: '142',
  commitAfterTermination: '143',
  terminateBeforeInitialization: '112',
  terminateAfterTermination: '113',
  invalidArgument: '201',
  undefinedElement: '401',
  keywordSet: '404',
  readOnly: '404',
  writeOnly: '405',
  typeMismatch: '406',
  outOfRange: '407',
  tooLong: '351',
  valueNotInitialized: '403',
};

// ---------------------------------------------------------------------------
// Shared runtime engine
// ---------------------------------------------------------------------------

interface Dialect {
  model: Record<string, ElementDef>;
  defaults: Record<string, string>;
  errors: Record<string, string>;
  errorMap: ErrorMap;
  learnerIdElement: string;
  learnerNameElement: string;
  entryElement: string;
  bookmarkElement: string;
  sessionTimeElement: string;
  totalTimeElement: string;
  parseTime: (value: string) => number | null;
  formatTime: (milliseconds: number) => string;
  computeStatus: (read: (element: string) => string | undefined) => ScormStatusChange;
}

type RuntimeState = 'not-initialized' | 'initialized' | 'terminated';

class CmiRuntime {
  private state: RuntimeState = 'not-initialized';
  private readonly store = new Map<string, string>();
  private lastError = '0';
  private lastDiagnostic = '';

  constructor(
    private readonly dialect: Dialect,
    private readonly opts: ScormApiOptions,
  ) {
    for (const [element, value] of Object.entries(dialect.defaults)) {
      this.store.set(element, value);
    }
    if (opts.learnerId !== undefined) this.store.set(dialect.learnerIdElement, opts.learnerId);
    if (opts.learnerName !== undefined) {
      this.store.set(dialect.learnerNameElement, opts.learnerName);
    }
    const seeded = flattenCmi(opts.initialCmi ?? {});
    for (const [element, value] of Object.entries(seeded)) {
      if (element in dialect.model) this.store.set(element, value);
    }
    if (this.store.get('cmi.suspend_data') || this.store.get(dialect.bookmarkElement)) {
      this.store.set(dialect.entryElement, 'resume');
    }
  }

  initialize(param: string): ScormBoolean {
    if (!isEmptyParam(param)) return this.fail(this.dialect.errorMap.invalidArgument);
    if (this.state === 'initialized') return this.fail(this.dialect.errorMap.alreadyInitialized);
    if (this.state === 'terminated') {
      return this.fail(this.dialect.errorMap.initializeAfterTermination);
    }
    this.state = 'initialized';
    return this.ok();
  }

  terminate(param: string): ScormBoolean {
    if (!isEmptyParam(param)) return this.fail(this.dialect.errorMap.invalidArgument);
    if (this.state === 'not-initialized') {
      return this.fail(this.dialect.errorMap.terminateBeforeInitialization);
    }
    if (this.state === 'terminated') {
      return this.fail(this.dialect.errorMap.terminateAfterTermination);
    }
    this.accumulateSessionTime();
    this.state = 'terminated';
    this.opts.onCommit?.(this.serialize());
    return this.ok();
  }

  getValue(element: string): string {
    if (this.state === 'not-initialized') {
      this.fail(this.dialect.errorMap.getBeforeInitialization);
      return '';
    }
    if (this.state === 'terminated') {
      this.fail(this.dialect.errorMap.getAfterTermination);
      return '';
    }
    if (!element) {
      this.fail(this.dialect.errorMap.invalidArgument);
      return '';
    }
    const def = this.dialect.model[element];
    if (!def) {
      this.fail(this.dialect.errorMap.undefinedElement, `Unknown element: ${element}`);
      return '';
    }
    if (def.access === 'wo') {
      this.fail(this.dialect.errorMap.writeOnly, `${element} is write only`);
      return '';
    }
    const value = this.store.get(element);
    if (value === undefined) {
      const code = this.dialect.errorMap.valueNotInitialized;
      if (code) this.fail(code, `${element} has not been set`);
      else this.ok();
      return '';
    }
    this.ok();
    return value;
  }

  setValue(element: string, value: string): ScormBoolean {
    if (this.state === 'not-initialized') {
      return this.fail(this.dialect.errorMap.setBeforeInitialization);
    }
    if (this.state === 'terminated') {
      return this.fail(this.dialect.errorMap.setAfterTermination);
    }
    if (!element) return this.fail(this.dialect.errorMap.invalidArgument);
    const def = this.dialect.model[element];
    if (!def) {
      return this.fail(this.dialect.errorMap.undefinedElement, `Unknown element: ${element}`);
    }
    if (element.endsWith('._children') || element.endsWith('._count')) {
      return this.fail(this.dialect.errorMap.keywordSet, `${element} is a keyword`);
    }
    if (def.access === 'ro') {
      return this.fail(this.dialect.errorMap.readOnly, `${element} is read only`);
    }
    const coerced = String(value);
    const verdict = def.validate ? def.validate(coerced) : 'ok';
    if (verdict === 'type') {
      return this.fail(this.dialect.errorMap.typeMismatch, `Bad value for ${element}: ${coerced}`);
    }
    if (verdict === 'range') {
      return this.fail(this.dialect.errorMap.outOfRange, `Out of range for ${element}: ${coerced}`);
    }
    if (verdict === 'too-long') {
      return this.fail(this.dialect.errorMap.tooLong, `Value exceeds limit for ${element}`);
    }
    const previous = this.store.get(element);
    this.store.set(element, coerced);
    if (def.statusElement && previous !== coerced) {
      this.opts.onStatusChange?.(this.dialect.computeStatus((el) => this.store.get(el)));
    }
    return this.ok();
  }

  commit(param: string): ScormBoolean {
    if (!isEmptyParam(param)) return this.fail(this.dialect.errorMap.invalidArgument);
    if (this.state === 'not-initialized') {
      return this.fail(this.dialect.errorMap.commitBeforeInitialization);
    }
    if (this.state === 'terminated') {
      return this.fail(this.dialect.errorMap.commitAfterTermination);
    }
    this.opts.onCommit?.(this.serialize());
    return this.ok();
  }

  getLastError(): string {
    return this.lastError;
  }

  getErrorString(errorCode: string): string {
    return this.dialect.errors[String(errorCode)] ?? '';
  }

  getDiagnostic(errorCode: string): string {
    const code = String(errorCode);
    if (code === '' || code === this.lastError) {
      return this.lastDiagnostic || this.getErrorString(this.lastError);
    }
    return this.getErrorString(code);
  }

  /** The full flat CMI map, exactly what onCommit receives. */
  serialize(): Record<string, string> {
    return Object.fromEntries(this.store);
  }

  private accumulateSessionTime(): void {
    const session = this.store.get(this.dialect.sessionTimeElement);
    if (session === undefined) return;
    const sessionMs = this.dialect.parseTime(session) ?? 0;
    const totalMs =
      this.dialect.parseTime(this.store.get(this.dialect.totalTimeElement) ?? '') ?? 0;
    this.store.set(this.dialect.totalTimeElement, this.dialect.formatTime(totalMs + sessionMs));
  }

  private ok(): ScormBoolean {
    this.lastError = '0';
    this.lastDiagnostic = '';
    return 'true';
  }

  private fail(code: string, diagnostic = ''): ScormBoolean {
    this.lastError = code;
    this.lastDiagnostic = diagnostic;
    return 'false';
  }
}

function isEmptyParam(param: unknown): boolean {
  // The single argument to Initialize/Terminate/Commit must be ''. Some
  // content passes nothing at all; tolerate undefined/null as empty.
  return param === '' || param === undefined || param === null;
}

function toNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Public factories
// ---------------------------------------------------------------------------

/** Creates a SCORM 1.2 runtime API; install it as `window.API`. */
export function createScorm12Api(opts: ScormApiOptions = {}): Scorm12Api {
  const runtime = new CmiRuntime(
    {
      model: SCORM12_MODEL,
      defaults: SCORM12_DEFAULTS,
      errors: SCORM12_ERRORS,
      errorMap: SCORM12_ERROR_MAP,
      learnerIdElement: 'cmi.core.student_id',
      learnerNameElement: 'cmi.core.student_name',
      entryElement: 'cmi.core.entry',
      bookmarkElement: 'cmi.core.lesson_location',
      sessionTimeElement: 'cmi.core.session_time',
      totalTimeElement: 'cmi.core.total_time',
      parseTime: parseScorm12Time,
      formatTime: formatScorm12Time,
      computeStatus: (read) => {
        const status = read('cmi.core.lesson_status') ?? 'not attempted';
        return {
          completed: status === 'completed' || status === 'passed',
          passed: status === 'passed' ? true : status === 'failed' ? false : undefined,
          scoreRaw: toNumber(read('cmi.core.score.raw')),
        };
      },
    },
    opts,
  );
  return {
    LMSInitialize: (param) => runtime.initialize(param),
    LMSFinish: (param) => runtime.terminate(param),
    LMSGetValue: (element) => runtime.getValue(element),
    LMSSetValue: (element, value) => runtime.setValue(element, value),
    LMSCommit: (param) => runtime.commit(param),
    LMSGetLastError: () => runtime.getLastError(),
    LMSGetErrorString: (errorCode) => runtime.getErrorString(errorCode),
    LMSGetDiagnostic: (errorCode) => runtime.getDiagnostic(errorCode),
  };
}

/** Creates a SCORM 2004 runtime API; install it as `window.API_1484_11`. */
export function createScorm2004Api(opts: ScormApiOptions = {}): Scorm2004Api {
  const runtime = new CmiRuntime(
    {
      model: SCORM2004_MODEL,
      defaults: SCORM2004_DEFAULTS,
      errors: SCORM2004_ERRORS,
      errorMap: SCORM2004_ERROR_MAP,
      learnerIdElement: 'cmi.learner_id',
      learnerNameElement: 'cmi.learner_name',
      entryElement: 'cmi.entry',
      bookmarkElement: 'cmi.location',
      sessionTimeElement: 'cmi.session_time',
      totalTimeElement: 'cmi.total_time',
      parseTime: parseScorm2004Duration,
      formatTime: formatScorm2004Duration,
      computeStatus: (read) => {
        const success = read('cmi.success_status');
        return {
          completed: read('cmi.completion_status') === 'completed',
          passed: success === 'passed' ? true : success === 'failed' ? false : undefined,
          scoreRaw: toNumber(read('cmi.score.raw')),
        };
      },
    },
    opts,
  );
  return {
    Initialize: (param) => runtime.initialize(param),
    Terminate: (param) => runtime.terminate(param),
    GetValue: (element) => runtime.getValue(element),
    SetValue: (element, value) => runtime.setValue(element, value),
    Commit: (param) => runtime.commit(param),
    GetLastError: () => runtime.getLastError(),
    GetErrorString: (errorCode) => runtime.getErrorString(errorCode),
    GetDiagnostic: (errorCode) => runtime.getDiagnostic(errorCode),
  };
}
