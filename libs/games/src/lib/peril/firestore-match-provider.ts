/**
 * Firestore-backed realtime opponent provider — TYPED SKELETON ONLY.
 *
 * Realtime human-vs-human PERIL! matches arrive with Phase 4 backend
 * integration. This file intentionally contains NO firebase imports; it
 * exists so the scene code is already written against the shared
 * {@link OpponentProvider} interface and Phase 4 only has to fill in the
 * transport.
 *
 * Planned wiring (Phase 4):
 *  - Lobby:     matches/{matchId} doc + lobby presence subcollection.
 *  - Buzzing:   server-timestamped buzz writes; first-write-wins arbitration
 *               in a Cloud Function to keep latency fair.
 *  - Answers:   answers subcollection with per-clue documents.
 *  - Wagers:    private wager docs revealed transactionally.
 */

import {
  ClueContext,
  OpponentEventListener,
  OpponentProfile,
  OpponentProvider,
  Unsubscribe,
} from './opponent-provider';

const PHASE_4_MESSAGE = 'Realtime matches arrive with Phase 4 backend integration';

/** Firestore document shape for a match lobby (Phase 4 contract draft). */
export interface MatchLobbyDoc {
  matchId: string;
  hostUid: string;
  status: 'scanning' | 'seated' | 'in-progress' | 'complete';
  seats: Array<{ uid: string; displayName: string }>;
  createdAt: number;
}

/** Firestore document shape for a single buzz attempt (Phase 4 contract draft). */
export interface BuzzAttemptDoc {
  matchId: string;
  clueId: string;
  uid: string;
  /** Client-measured latency; server timestamp is authoritative. */
  clientLatencyMs: number;
}

export class FirestoreMatchProvider implements OpponentProvider {
  // TODO(Phase 4): inject Firestore via @angular/fire and subscribe to the
  // lobby document; resolve with seated human opponents.
  joinLobby(_scanMs: number): Promise<OpponentProfile[]> {
    return Promise.reject(new Error(PHASE_4_MESSAGE));
  }

  // TODO(Phase 4): fan onSnapshot() listener data out as OpponentEvents.
  subscribe(_listener: OpponentEventListener): Unsubscribe {
    throw new Error(PHASE_4_MESSAGE);
  }

  // TODO(Phase 4): mark the clue's buzz window open in the match doc so
  // remote clients can submit BuzzAttemptDoc writes.
  openBuzzers(_ctx: ClueContext): void {
    throw new Error(PHASE_4_MESSAGE);
  }

  // TODO(Phase 4): close the buzz window transactionally.
  closeBuzzers(): void {
    throw new Error(PHASE_4_MESSAGE);
  }

  // TODO(Phase 4): no-op for humans (their own client submits answers);
  // validate the inbound answer doc instead.
  requestAnswer(_opponentId: string, _ctx: ClueContext): void {
    throw new Error(PHASE_4_MESSAGE);
  }

  // TODO(Phase 4): notify the remote client a wager is due; await their
  // private wager doc.
  requestWager(
    _opponentId: string,
    _kind: 'daily-double' | 'final',
    _score: number,
    _roundTopValue: number,
  ): void {
    throw new Error(PHASE_4_MESSAGE);
  }

  // TODO(Phase 4): detach all snapshot listeners.
  cancelPending(): void {
    throw new Error(PHASE_4_MESSAGE);
  }

  // TODO(Phase 4): remove presence + release the seat.
  leave(): void {
    throw new Error(PHASE_4_MESSAGE);
  }
}
