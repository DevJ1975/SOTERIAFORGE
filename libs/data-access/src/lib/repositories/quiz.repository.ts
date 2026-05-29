import { Firestore, orderBy } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Quiz, quiz } from '@forge/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/** Quizzes: tenants/{t}/quizzes/{quizId}. */
@Injectable({ providedIn: 'root' })
export class QuizRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string): BaseRepository<Quiz> {
    return new BaseRepository<Quiz>(this.fs, FsPaths.quizzes(tenantId), quiz, 'quiz');
  }

  getById(tenantId: string, quizId: string) {
    return this.repo(tenantId).getById(quizId);
  }

  list(tenantId: string) {
    return this.repo(tenantId).list(orderBy('title'));
  }

  set(tenantId: string, q: Quiz) {
    return this.repo(tenantId).set(q.id, q);
  }

  remove(tenantId: string, quizId: string) {
    return this.repo(tenantId).remove(quizId);
  }
}
