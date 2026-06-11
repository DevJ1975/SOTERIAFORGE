import { Injectable, inject } from '@angular/core';
import { Firestore } from '@angular/fire/firestore';
import { doc, setDoc } from 'firebase/firestore';
import { PrincipalStore } from '@forge/auth';
import { gameResultDoc, gameResultsCol } from '@forge/data-access';
import type { GameResultReport, GameResultSink } from '@forge/games';

/**
 * Firestore-backed {@link GameResultSink} for the learner app.
 *
 * Writes finished arcade runs to /tenants/{tenantId}/gameResults/{id} through
 * the zod-validated converters in @forge/data-access. The returned promise
 * resolves once the Firestore write lands — NOT once XP is credited; the
 * onGameResultCreated trigger stamps `xpAwarded` server-side a few seconds
 * later, which is why games show a 'syncing' state until this resolves and
 * point players at their Profile afterwards.
 *
 * Error contract (relied on by the game components):
 * - Called while signed out or without a tenant claim → throws
 *   `Error('unauthenticated')`. Games catch exactly that message and swap the
 *   XP chip for 'Sign in to earn XP from the Arcade' copy.
 * - Any other failure (rules rejection, network, …) rejects with the original
 *   error and games show a quiet 'Could not record this run' note.
 */
@Injectable({ providedIn: 'root' })
export class FirestoreGameResultSink implements GameResultSink {
  private readonly db = inject(Firestore);
  private readonly principal = inject(PrincipalStore);

  async report(result: GameResultReport): Promise<void> {
    const uid = this.principal.uid();
    const tenantId = this.principal.tenantId();
    if (!uid || !tenantId) {
      throw new Error('unauthenticated');
    }

    // Firestore-generated id, written through the validating doc converter.
    const id = doc(gameResultsCol(this.db, tenantId)).id;
    await setDoc(gameResultDoc(this.db, tenantId, id), {
      id,
      uid,
      tenantId,
      game: result.game,
      score: result.score,
      ...(result.maxScore !== undefined ? { maxScore: result.maxScore } : {}),
      ...(result.won !== undefined ? { won: result.won } : {}),
      at: new Date().toISOString(),
    });
  }
}
