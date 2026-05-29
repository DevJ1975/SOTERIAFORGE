import { Firestore, orderBy, where } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Course, type Member, type Tenant, course, member, tenant } from '@forge/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

@Injectable({ providedIn: 'root' })
export class TenantRepository extends BaseRepository<Tenant> {
  constructor() {
    super(inject(Firestore), FsPaths.tenants(), tenant, 'tenant');
  }
}

@Injectable({ providedIn: 'root' })
export class MemberRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string): BaseRepository<Member> {
    return new BaseRepository<Member>(this.fs, FsPaths.members(tenantId), member, 'member');
  }

  getById(tenantId: string, uid: string) {
    return this.repo(tenantId).getById(uid);
  }

  set(tenantId: string, m: Member) {
    return this.repo(tenantId).set(m.uid, m);
  }

  update(tenantId: string, uid: string, partial: Partial<Member>) {
    return this.repo(tenantId).update(uid, partial);
  }

  listActive(tenantId: string) {
    return this.repo(tenantId).list(where('status', '==', 'active'), orderBy('displayName'));
  }
}

@Injectable({ providedIn: 'root' })
export class CourseRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string): BaseRepository<Course> {
    return new BaseRepository<Course>(this.fs, FsPaths.courses(tenantId), course, 'course');
  }

  getById(tenantId: string, courseId: string) {
    return this.repo(tenantId).getById(courseId);
  }

  listPublished(tenantId: string) {
    return this.repo(tenantId).list(where('status', '==', 'published'), orderBy('title'));
  }

  set(tenantId: string, c: Course) {
    return this.repo(tenantId).set(c.id, c);
  }
}
