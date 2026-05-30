import { Firestore, orderBy } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Game, game } from '@assurance/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/** Interactive games: tenants/{t}/games/{gameId}. */
@Injectable({ providedIn: 'root' })
export class GameRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string): BaseRepository<Game> {
    return new BaseRepository<Game>(this.fs, FsPaths.games(tenantId), game, 'game');
  }

  getById(tenantId: string, gameId: string) {
    return this.repo(tenantId).getById(gameId);
  }

  list(tenantId: string) {
    return this.repo(tenantId).list(orderBy('title'));
  }

  set(tenantId: string, g: Game) {
    return this.repo(tenantId).set(g.id, g);
  }

  remove(tenantId: string, gameId: string) {
    return this.repo(tenantId).remove(gameId);
  }
}
