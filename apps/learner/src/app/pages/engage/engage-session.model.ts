/*
 * Forge Engage live sessions: the server's SessionState and the pure helpers the
 * session UI is built from. Everything time-based is computed from server times plus
 * a clock offset, so a learner's wrong clock never changes a countdown.
 */

export interface SessionStage {
  key: string;
  label: string;
  minutes: number;
}

export interface ActivityOption {
  id: string;
  label: string;
  detail: string;
}

export interface SessionActivity {
  id: string;
  kind: 'poll' | 'hunt';
  prompt: string;
  options: ActivityOption[];
  opensAt: string;
  closesAt: string;
  status: 'open' | 'closed';
  myResponse: { optionId: string; answeredAt: string; elapsedMs: number } | null;
  /** Polls: always present. Hunts: only once closed. */
  results: { total: number; counts: { optionId: string; count: number }[] } | null;
  /** Hunts, once closed. */
  correctOptionId: string | null;
  /** Hunts, as soon as I have answered. */
  myResult: {
    correct: boolean;
    crewRank: number | null;
    classRank: number | null;
    xp: number;
  } | null;
}

export interface CrewMemberScore {
  memberId: string;
  name: string;
  isLead: boolean;
  points: number;
  isMe: boolean;
}

export interface SessionCrew {
  id: string;
  name: string;
  rank: number;
  crewCount: number;
  total: number;
  members: CrewMemberScore[];
}

export interface SessionHuddle {
  text: string;
  updatedAt: string | null;
  updatedByName: string | null;
  canEdit: boolean;
}

export interface RaisedHand {
  memberId: string;
  name: string;
  raisedAt: string;
}

export interface SessionState {
  id: string;
  classroomId: string;
  title: string;
  status: 'live' | 'ended';
  version: number;
  serverTime: string;
  block: {
    /** 1-based. */
    index: number;
    count: number;
    /** 0-based. */
    stageIndex: number;
    stageStartedAt: string;
    stages: SessionStage[];
  };
  activity: SessionActivity | null;
  /** My own crew only. */
  crew: SessionCrew | null;
  /** My crew's note for the current block. */
  huddle: SessionHuddle | null;
  me: { isHost: boolean; handRaised: boolean; removed: boolean };
  /** Hosts only; empty for learners. */
  hands: RaisedHand[];
  crewMemberIds: string[];
}

export interface SessionPing {
  sessionId: string;
  version: number;
}

export interface NewActivityInput {
  kind: 'poll' | 'hunt';
  prompt: string;
  options: { label: string; detail?: string }[];
  /** Hunts only. */
  correctIndex?: number;
  seconds: number;
  /** Hunts only. */
  xp?: number;
}

export type ModerationAction = 'mute' | 'remove' | 'lower_hand';

export interface AttendanceRow {
  memberId: string;
  name: string;
  crew: string | null;
  firstJoinedAt: string;
  lastSeenAt: string;
  minutes: number;
  removed: boolean;
}

export interface Heatmap {
  activities: { id: string; kind: 'poll' | 'hunt'; prompt: string; block: number }[];
  crews: {
    crewId: string;
    name: string;
    cells: {
      activityId: string;
      members: number;
      responded: number;
      correct: number | null;
      /** 0-1. */
      rate: number | null;
    }[];
  }[];
}

/** The topic of the server's "state changed" data message. */
export const ENGAGE_TOPIC = 'forge-engage';

/** A data message's payload as a ping, or null when it is not one. */
export function parsePing(payload: Uint8Array): SessionPing | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(payload));
    if (
      value &&
      typeof value === 'object' &&
      'sessionId' in value &&
      typeof value.sessionId === 'string' &&
      value.sessionId
    ) {
      const version = 'version' in value && typeof value.version === 'number' ? value.version : 0;
      return { sessionId: value.sessionId, version };
    }
  } catch {
    // Not JSON: not ours.
  }
  return null;
}

/** Milliseconds left in the current stage at server time `now` (never negative). */
export function stageRemainingMs(state: SessionState, now: number): number {
  const stage = state.block.stages[state.block.stageIndex];
  if (!stage) return 0;
  const end = Date.parse(state.block.stageStartedAt) + stage.minutes * 60_000;
  return Math.max(0, end - now);
}

/** Milliseconds left to answer at server time `now`; 0 once closed. */
export function activityRemainingMs(activity: SessionActivity, now: number): number {
  if (activity.status === 'closed') return 0;
  return Math.max(0, Date.parse(activity.closesAt) - now);
}

/** `m:ss`, rounding up so a countdown reads 0:01 until it is truly over. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** `mm:ss` for the block bar. */
export function longClock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Share of `total` as a whole percent. */
export function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

/**
 * What a screen reader should hear about a countdown: once when it opens, at 30 and
 * 10 seconds, and when it closes. Returns '' for every other second.
 */
export function countdownAnnouncement(
  previousMs: number | null,
  currentMs: number,
  what: string,
): string {
  if (previousMs === null) return `${what} is open. ${spoken(currentMs)} to answer.`;
  if (previousMs > 0 && currentMs <= 0) return `${what} is closed.`;
  for (const mark of [30_000, 10_000]) {
    if (previousMs > mark && currentMs <= mark && currentMs > 0) {
      return `${mark / 1000} seconds left.`;
    }
  }
  return '';
}

function spoken(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [];
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (rest || !minutes) parts.push(`${rest} second${rest === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export const TILES_PER_PAGE = 6;

/** The fields crew-first ordering reads from a video tile. */
export interface OrderableTile {
  /** The participant's member id (a screen share keeps its sharer's id). */
  participantId: string;
  local: boolean;
  staff: boolean;
}

/**
 * Staff first, then my crew, then everyone else. The order inside each group is the
 * order given (join order), so who is speaking never moves a tile.
 */
export function crewFirst<T extends OrderableTile>(
  tiles: readonly T[],
  crewIds: readonly string[],
): T[] {
  const crew = new Set(crewIds);
  const group = (tile: T) => (tile.staff ? 0 : crew.has(tile.participantId) ? 1 : 2);
  return tiles
    .map((tile, index) => ({ tile, index }))
    .sort((a, b) => group(a.tile) - group(b.tile) || a.index - b.index)
    .map((entry) => entry.tile);
}

export function pageCount(total: number, size = TILES_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Page `page` (1-based), clamped to the pages that exist. */
export function pageOf<T>(items: readonly T[], page: number, size = TILES_PER_PAGE): T[] {
  const current = Math.min(Math.max(1, page), pageCount(items.length, size));
  return items.slice((current - 1) * size, current * size);
}

/** Notes belong to the stages where crews talk and report back. */
export function huddleStage(state: SessionState): boolean {
  const key = state.block.stages[state.block.stageIndex]?.key.toLowerCase() ?? '';
  return key === 'huddle' || key === 'report';
}

export function debriefStage(state: SessionState): boolean {
  return state.block.stages[state.block.stageIndex]?.key.toLowerCase() === 'debrief';
}
