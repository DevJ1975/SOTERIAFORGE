import { Firestore } from '@angular/fire/firestore';
import { Injectable, inject } from '@angular/core';
import { type Enrollment, enrollment } from '@forge/shared';
import { BaseRepository } from '../base-repository';
import { FsPaths } from '../paths';

@Injectable({ providedIn: 'root' })
export class EnrollmentRepository {
  private readonly fs = inject(Firestore);

  private repo(tenantId: string, courseId: string): BaseRepository<Enrollment> {
    return new BaseRepository<Enrollment>(
      this.fs,
      FsPaths.enrollments(tenantId, courseId),
      enrollment,
      'enrollment',
    );
  }

  get(tenantId: string, courseId: string, uid: string) {
    return this.repo(tenantId, courseId).getById(uid);
  }

  watch(tenantId: string, courseId: string, uid: string) {
    return this.repo(tenantId, courseId).watch(uid);
  }

  upsert(tenantId: string, courseId: string, e: Enrollment) {
    return this.repo(tenantId, courseId).set(e.uid, e);
  }

  updateProgress(tenantId: string, courseId: string, uid: string, partial: Partial<Enrollment>) {
    return this.repo(tenantId, courseId).update(uid, partial);
  }
}
