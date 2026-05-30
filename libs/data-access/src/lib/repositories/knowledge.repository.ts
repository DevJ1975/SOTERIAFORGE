import { Firestore, orderBy } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type KnowledgeSource, knowledgeSource } from '@assurance/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/** AI knowledge sources: tenants/{t}/knowledgeBase/{docId}. Admin-managed. */
@Injectable({ providedIn: 'root' })
export class KnowledgeRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string): BaseRepository<KnowledgeSource> {
    return new BaseRepository<KnowledgeSource>(
      this.fs,
      FsPaths.knowledgeBase(tenantId),
      knowledgeSource,
      'knowledgeSource',
    );
  }

  getById(tenantId: string, docId: string) {
    return this.repo(tenantId).getById(docId);
  }

  list(tenantId: string) {
    return this.repo(tenantId).list(orderBy('createdAt', 'desc'));
  }

  set(tenantId: string, source: KnowledgeSource) {
    return this.repo(tenantId).set(source.id, source);
  }

  remove(tenantId: string, docId: string) {
    return this.repo(tenantId).remove(docId);
  }
}
