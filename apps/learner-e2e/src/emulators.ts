import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { workspaceRoot } from '@nx/devkit';

/**
 * Ports per workspace firebase.json. The apps connect to `localhost`; we pin
 * 127.0.0.1 for the Node-side seeding/polling because this environment may
 * lack IPv6 (Node would otherwise try ::1 first).
 */
export const AUTH_EMULATOR_HOST = '127.0.0.1:9099';
export const FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
export const PROJECT_ID = 'soteria-forge-dev';

const RUN_DIR = path.join(__dirname, '..', '.emulators');
const STATE_FILE = path.join(RUN_DIR, 'state.json');
const LOG_FILE = path.join(RUN_DIR, 'emulators.log');
/** E2E-only emulator config: UI disabled, IPv4 hosts (no IPv6 here). */
const E2E_FIREBASE_CONFIG = path.join(__dirname, '..', 'firebase.e2e.json');

const READY_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 15_000;

interface EmulatorState {
  /** Pid of the detached `firebase emulators:start` process group leader. */
  pid: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ping(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

/** True when both the Auth and Firestore emulators answer on their ports. */
export async function emulatorsUp(): Promise<boolean> {
  const [auth, firestore] = await Promise.all([
    ping(`http://${AUTH_EMULATOR_HOST}/`),
    ping(`http://${FIRESTORE_EMULATOR_HOST}/`),
  ]);
  return auth && firestore;
}

/**
 * Boots `firebase emulators:start --only auth,firestore` detached, polling the
 * ports until both answer. When the emulators are already running (e.g. a dev
 * loop, or a previous interrupted run) they are reused and no state file is
 * written, so teardown leaves them alone.
 */
export async function startEmulators(): Promise<void> {
  if (await emulatorsUp()) {
    console.log('[learner-e2e] Reusing already-running Firebase emulators.');
    return;
  }

  mkdirSync(RUN_DIR, { recursive: true });
  // firebase.e2e.json may only reference files inside its own directory, so
  // refresh copies of the canonical rules/indexes into the run dir.
  copyFileSync(path.join(workspaceRoot, 'firestore.rules'), path.join(RUN_DIR, 'firestore.rules'));
  copyFileSync(
    path.join(workspaceRoot, 'firestore.indexes.json'),
    path.join(RUN_DIR, 'firestore.indexes.json'),
  );
  const log = openSync(LOG_FILE, 'w');
  const child = spawn(
    'npx',
    [
      'firebase',
      'emulators:start',
      '--only',
      'auth,firestore',
      '--project',
      PROJECT_ID,
      '--config',
      E2E_FIREBASE_CONFIG,
    ],
    { cwd: workspaceRoot, detached: true, stdio: ['ignore', log, log] },
  );
  child.unref();
  if (child.pid === undefined) {
    throw new Error('[learner-e2e] Failed to spawn the Firebase emulators.');
  }
  const state: EmulatorState = { pid: child.pid };
  writeFileSync(STATE_FILE, JSON.stringify(state));
  console.log(`[learner-e2e] Starting Firebase emulators (pid ${child.pid})…`);

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await emulatorsUp()) {
      console.log('[learner-e2e] Firebase emulators are ready (auth :9099, firestore :8080).');
      return;
    }
    if (child.exitCode !== null) break; // crashed — fail fast with the log tail
    await sleep(500);
  }

  const tail = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8').slice(-4_000) : '';
  await stopEmulators();
  throw new Error(
    `[learner-e2e] Firebase emulators did not become ready within ${READY_TIMEOUT_MS / 1000}s.\n` +
      `--- ${LOG_FILE} (tail) ---\n${tail}`,
  );
}

/** Stops the emulators iff this run started them (state file present). */
export async function stopEmulators(): Promise<void> {
  if (!existsSync(STATE_FILE)) return;
  let pid: number | undefined;
  try {
    pid = (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as EmulatorState).pid;
  } catch {
    pid = undefined;
  }
  rmSync(STATE_FILE, { force: true });
  if (!pid) return;

  // Detached spawn put npx + firebase + the JVM in their own process group.
  const kill = (signal: NodeJS.Signals) => {
    try {
      process.kill(-(pid as number), signal);
    } catch {
      try {
        process.kill(pid as number, signal);
      } catch {
        // Already gone.
      }
    }
  };

  kill('SIGTERM');
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline && (await emulatorsUp())) {
    await sleep(500);
  }
  if (await emulatorsUp()) kill('SIGKILL');
  console.log('[learner-e2e] Firebase emulators stopped.');
}
