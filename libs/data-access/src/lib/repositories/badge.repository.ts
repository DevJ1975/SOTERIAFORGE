import { Firestore, orderBy } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Badge, badge } from '@assurance/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

/** Badge definitions (Open Badges 3.0 metadata): tenants/{t}/badges/{badgeId}. */
@Injectable({ providedIn: 'root' })
export class BadgeRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string): BaseRepository<Badge> {
    return new BaseRepository<Badge>(this.fs, FsPaths.badges(tenantId), badge, 'badge');
  }

  getById(tenantId: string, badgeId: string) {
    return this.repo(tenantId).getById(badgeId);
  }

  list(tenantId: string) {
    return this.repo(tenantId).list(orderBy('name'));
  }

  set(tenantId: string, b: Badge) {
    return this.repo(tenantId).set(b.id, b);
  }

  remove(tenantId: string, badgeId: string) {
    return this.repo(tenantId).remove(badgeId);
  }
}
