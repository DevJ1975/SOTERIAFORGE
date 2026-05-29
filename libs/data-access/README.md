# @forge/data-access

Typed, tenant-scoped Firestore access for Soteria FORGE.

- `zodConverter` — schema-backed `FirestoreDataConverter`; validates on read
  (drift defense) and write, injects/strips the synthetic `id`.
- `FsPaths` — the single source of truth for every Firestore path (§6). All
  paths are tenant-qualified so repositories can never accidentally cross
  tenants.
- `BaseRepository<T>` — generic CRUD + live `watch()` bound to a collection path
  and schema.
- Repositories — `TenantRepository`, `MemberRepository`, `CourseRepository`,
  `EnrollmentRepository` (subcollection repos take `tenantId` per call).
- `provideForgeFirebase` — App + Auth + Firestore + App Check wiring, with
  emulator support.

Isolation is enforced authoritatively by Firestore security rules; this lib is
the typed convenience layer on top.
