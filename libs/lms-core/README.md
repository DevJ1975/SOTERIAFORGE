# @assurance/lms-core

Course, module, and enrollment domain logic for Soteria Assurance.

## What's inside

| File              | Purpose                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- |
| `progress.ts`     | Pure functions: `computeCourseProgress`, `isModuleComplete`, `nextIncompleteModule` |
| `course.store.ts` | NgRx SignalStore `CourseStore` — state, computed signals, async load methods        |
| `learning-api.ts` | `LearningApi` — courses, enrollments, completions against the Forge API             |

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

### LearningApi

```ts
const api = inject(LearningApi);

await api.enroll(courseId);
// Lesson completion / score is server-authoritative: the Forge API records it and
// returns the awards; the client never decides rewards.
```

## Tests

```bash
npx nx test lms-core
npx nx lint lms-core
```
