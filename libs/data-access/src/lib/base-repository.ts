import {
  CollectionReference,
  type DocumentData,
  Firestore,
  type QueryConstraint,
  collection,
  deleteDoc,
  doc,
  docData,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import type { Observable } from 'rxjs';
import { type SchemaOf, safeParseSnapshot, zodConverter } from './converters';

/**
 * Generic Firestore repository bound to a collection path and a zod schema.
 * All concrete repositories are tenant-scoped by passing a tenant-qualified
 * collection path (see FsPaths). This class never crosses tenant boundaries.
 */
export class BaseRepository<T extends { id?: string } & DocumentData> {
  private readonly converter;

  constructor(
    protected readonly fs: Firestore,
    protected readonly collectionPath: string,
    private readonly schema: SchemaOf<T>,
    private readonly context = 'document',
  ) {
    this.converter = zodConverter<T>(schema, context);
  }

  protected col(): CollectionReference<T> {
    return collection(this.fs, this.collectionPath).withConverter(this.converter);
  }

  protected ref(id: string) {
    return doc(this.fs, `${this.collectionPath}/${id}`).withConverter(this.converter);
  }

  async getById(id: string): Promise<T | null> {
    const snap = await getDoc(this.ref(id));
    return snap.exists() ? snap.data() : null;
  }

  /** Live document stream (signals can wrap via toSignal). */
  watch(id: string): Observable<T | undefined> {
    return docData(this.ref(id)) as Observable<T | undefined>;
  }

  async list(...constraints: QueryConstraint[]): Promise<T[]> {
    // Read WITHOUT the strict converter so a single invalid/stale-cached doc can
    // be skipped-and-logged (MO-01) instead of throwing and blanking the list.
    const plain = collection(this.fs, this.collectionPath);
    const snap = await getDocs(query(plain, ...constraints));
    const out: T[] = [];
    for (const d of snap.docs) {
      const parsed = safeParseSnapshot<T>(this.schema, d, this.context);
      if (parsed !== null) out.push(parsed);
    }
    return out;
  }

  /** Create or replace a document at a known id. */
  async set(id: string, value: T): Promise<void> {
    await setDoc(this.ref(id), value, { merge: false });
  }

  async update(id: string, partial: Partial<T>): Promise<void> {
    await updateDoc(this.ref(id), partial as DocumentData);
  }

  async remove(id: string): Promise<void> {
    await deleteDoc(this.ref(id));
  }
}
