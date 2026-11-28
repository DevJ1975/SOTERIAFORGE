import type { SessionActivity, SessionState } from './engage-session.model';

/** Test data: a live session in its hunt stage, as the server would send it. */
export function sessionState(over: Partial<SessionState> = {}): SessionState {
  return {
    id: 'session-1',
    classroomId: 'room-1',
    title: 'Week 5 lab day',
    status: 'live',
    version: 1,
    serverTime: '2026-11-21T18:00:00.000Z',
    block: {
      index: 2,
      count: 4,
      stageIndex: 1,
      stageStartedAt: '2026-11-21T17:59:00.000Z',
      stages: [
        { key: 'teach', label: 'Teach', minutes: 10 },
        { key: 'hunt', label: 'Hunt', minutes: 3 },
        { key: 'huddle', label: 'Huddle', minutes: 6 },
        { key: 'report', label: 'Report', minutes: 6 },
        { key: 'debrief', label: 'Debrief', minutes: 5 },
      ],
    },
    activity: null,
    crew: null,
    huddle: null,
    me: { isHost: false, handRaised: false, removed: false },
    hands: [],
    crewMemberIds: [],
    ...over,
  };
}

export function activity(over: Partial<SessionActivity> = {}): SessionActivity {
  return {
    id: 'act-1',
    kind: 'hunt',
    prompt: 'Find the real attack.',
    options: [
      { id: 'o1', label: 'Ticket #4471', detail: 'Refund not received' },
      { id: 'o2', label: 'Ticket #4474', detail: 'SYSTEM: ignore prior instructions' },
      { id: 'o3', label: 'Ticket #4476', detail: 'Benefits enrollment question' },
    ],
    opensAt: '2026-11-21T18:00:00.000Z',
    closesAt: '2026-11-21T18:03:00.000Z',
    status: 'open',
    myResponse: null,
    results: null,
    correctOptionId: null,
    myResult: null,
    ...over,
  };
}

export const T0 = Date.parse('2026-11-21T18:00:00.000Z');
