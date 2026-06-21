# @assurance/lms-core

Course, module, and enrollment domain logic for Soteria Assurance.

## What's inside

| File                    | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `progress.ts`           | Pure functions: `computeCourseProgress`, `isModuleComplete`, `nextIncompleteModule` |
| `course.store.ts`       | NgRx SignalStore `CourseStore` — state, computed signals, async load methods        |
| `enrollment.service.ts` | `EnrollmentService` — `enroll()` and `saveCmi()` (completion is server-side)        |

## Usage

### Progress helpers (pure, no Angular)

```ts
import { computeCourseProgress, isModuleComplete, nextIncompleteModule } from '@assurance/lms-core';

const pct = computeCourseProgress(modules, completedIds); // 0–100
const done = isModuleComplete(module, { score: 85, progressPct: 90 });
const next = nextIncompleteModule(modules, completedIds); // Module | null
```

### CourseStore (NgRx SignalStore)

```ts
@Component({
  providers: [CourseStore], // per-component scope
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CourseViewComponent {
  readonly store = inject(CourseStore);

  ngOnInit() {
    this.store.load(tenantId, courseId, uid);
  }
}
```

Computed signals: `store.progressPct()`, `store.nextModule()`, `store.isComplete()`.

### EnrollmentService

```ts
const svc = inject(EnrollmentService);

await svc.enroll(tenantId, courseId, uid);
// Module completion / score is server-authoritative: emitted by the players and
// recorded via the `completeModule` / `submitQuiz` Cloud Functions, not the client.
await svc.saveCmi(tenantId, courseId, uid, moduleId, cmi); // SCORM runtime state only
```

## Tests

```bash
npx nx test lms-core
npx nx lint lms-core
```
