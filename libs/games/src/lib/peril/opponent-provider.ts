/**
 * Opponent provider abstraction for PERIL! — pure logic, no Phaser imports.
 *
 * The game talks to opponents (AI bots today, realtime humans in Phase 4)
 * exclusively through this interface, so swapping in a networked provider
 * requires no scene changes.
 */

export interface OpponentProfile {
  id: string;
  name: string;
  /** Procedural avatar parameters (drawn at the podium, no image assets). */
  avatar: OpponentAvatar;
}

export interface OpponentAvatar {
  /** Skin/face tint as a 24-bit RGB number. */
  faceColor: number;
  /** Shirt/podium accent tint. */
  shirtColor: number;
  /** Hair style index (0-3) interpreted by the renderer. */
  hairStyle: number;
  /** Hair tint. */
  hairColor: number;
  /** Whether the avatar wears safety specs. */
  glasses: boolean;
}

/** Everything an opponent needs to know to play a clue. */
export interface ClueContext {
  /** Dollar value at stake (clue value or accepted wager). */
  value: number;
  /** Top clue value of the current round (for wager ceilings). */
  roundTopValue: number;
  /** Number of multiple-choice options presented. */
  optionCount: number;
  /** Index of the correct option (local AI rolls accuracy against this). */
  correctOptionIndex: number;
  /** Opponents locked out of this clue (already answered wrong). */
  lockedOutIds: string[];
}

export type OpponentEvent =
  | {
      /** An opponent hit their buzzer `latencyMs` after the window opened. */
      type: 'buzz';
      opponentId: string;
      latencyMs: number;
    }
  | {
      /** An opponent committed to a response option after `thinkMs`. */
      type: 'answer';
      opponentId: string;
      optionIndex: number;
      thinkMs: number;
    }
  | {
      /** An opponent locked in a Daily Double or Final PERIL! wager. */
      type: 'wager';
      opponentId: string;
      kind: 'daily-double' | 'final';
      amount: number;
    }
  | {
      /** A remote opponent in control of the board picked a cell. */
      type: 'select';
      opponentId: string;
      categoryIndex: number;
      clueIndex: number;
    }
  | {
      /** An opponent left the match. */
      type: 'leave';
      opponentId: string;
    };

export type OpponentEventListener = (event: OpponentEvent) => void;
export type Unsubscribe = () => void;

/** Host-published snapshot of the authoritative game state (see 'state' events). */
export type HostStateListener = (state: Record<string, unknown>) => void;

/** Why a realtime match ended outside the normal flow. */
export type MatchEndReason = 'host-left' | 'finished';
export type MatchEndListener = (reason: MatchEndReason) => void;

export interface OpponentProvider {
  /**
   * Search for opponents for up to `scanMs`, then resolve with the seats
   * that will play. The AI provider "finds" its house bots; a realtime
   * provider resolves with whichever humans joined the lobby.
   */
  joinLobby(scanMs: number): Promise<OpponentProfile[]>;

  /** Subscribe to opponent events. Returns an unsubscribe function. */
  subscribe(listener: OpponentEventListener): Unsubscribe;

  /**
   * The buzzer window just opened for a revealed clue. Interested opponents
   * will emit 'buzz' events with their latency.
   */
  openBuzzers(ctx: ClueContext): void;

  /** Buzzer window closed (someone won it, or time expired). */
  closeBuzzers(): void;

  /** Ask one opponent (who won the buzz / owns the Daily Double) to answer. */
  requestAnswer(opponentId: string, ctx: ClueContext): void;

  /** Ask one opponent for a wager; they emit a 'wager' event. */
  requestWager(
    opponentId: string,
    kind: 'daily-double' | 'final',
    score: number,
    roundTopValue: number,
  ): void;

  /** Cancel every pending timer/announcement (scene teardown). */
  cancelPending(): void;

  /** Leave the match and release resources. */
  leave(): void;

  // ---- Optional realtime hooks ------------------------------------------------
  //
  // Networked providers relay LOCAL player actions to the other clients and
  // surface host-authoritative state. Local AI providers leave these
  // undefined; scenes call them with optional chaining.

  /** True for networked providers (remote humans behind the opponent ids). */
  readonly isRealtime?: boolean;

  /** The local player buzzed `latencyMs` after the window opened. */
  sendLocalBuzz?(latencyMs: number): void;

  /** The local player locked in a response option. */
  sendLocalAnswer?(optionIndex: number, thinkMs: number): void;

  /** The local player locked in a wager. */
  sendLocalWager?(kind: 'daily-double' | 'final', amount: number): void;

  /** The local player (in control) selected a board cell. */
  sendLocalSelect?(categoryIndex: number, clueIndex: number): void;

  /** Host only: publish an authoritative state snapshot (throttled ≥250ms). */
  publishState?(state: Record<string, unknown>): void;

  /** Guests: receive host-published state snapshots. */
  onHostState?(listener: HostStateListener): Unsubscribe;

  /** Notified when the realtime match ends abnormally (e.g. host left). */
  onMatchEnded?(listener: MatchEndListener): Unsubscribe;

  /** Host only: flip the match to 'playing' once the lobby countdown ends. */
  markStarted?(): void;

  /** Host only: flip the match to 'finished' at the natural end of the game. */
  completeMatch?(): void;
}
