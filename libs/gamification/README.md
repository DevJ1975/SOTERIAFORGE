# @forge/gamification

Client-side gamification helpers for XP, levels, streaks, and leaderboard ranking.

Import from the `@forge/gamification` alias (see `tsconfig.base.json`).

---

## Modules

### `leveling.ts` — XP / Level math

Pure functions; no state.

**Default curve:** Level N requires a cumulative total XP of `floor(100 × N^1.5)` to reach.

| Level | Cumulative XP threshold |
|-------|------------------------|
| 1     | 100                    |
| 2     | 282                    |
| 3     | 519                    |
| 4     | 800                    |
| 5     | 1118                   |
| 10    | 3162                   |

```ts
import { xpForLevel, levelForXp } from '@forge/gamification';

// Cumulative XP threshold to reach level 5
xpForLevel(5); // → 1118

// Level info for a member with 500 total XP
levelForXp(500); // → { level: 2, xpIntoLevel: 218, xpToNext: 237 }
```

Both functions accept an optional `LevelCurve` override `{ baseXp, exponent }`.

---

### `streaks.ts` — Activity streak tracking

Pure functions; no state.

**Rules (UTC calendar dates only):**
- Same UTC day as last activity → no change (idempotent).
- Exactly the next UTC calendar day → streak + 1.
- Gap > 1 day → streak resets to 1.
- No prior activity → streak starts at 1.

```ts
import { updateStreak } from '@forge/gamification';

updateStreak('2024-03-14T22:00:00Z', '2024-03-15T08:00:00Z', 3);
// → { streakDays: 4, incremented: true }
```

---

### `leaderboard.ts` — Leaderboard ranking

Pure function; no state.

**Ranking strategy:** Standard competition ranking ("1224") — ties share rank and skip
subsequent ranks. Two members with equal XP both receive rank 1; the next distinct
member receives rank 3.

```ts
import { rankEntries } from '@forge/gamification';

rankEntries([
  { uid: 'a', xp: 500, displayName: 'Alice' },
  { uid: 'b', xp: 500, displayName: 'Bob' },
  { uid: 'c', xp: 200, displayName: 'Carol' },
]);
// → [
//     { uid: 'a', xp: 500, rank: 1, displayName: 'Alice' },
//     { uid: 'b', xp: 500, rank: 1, displayName: 'Bob' },
//     { uid: 'c', xp: 200, rank: 3, displayName: 'Carol' },
//   ]
```

> **Anti-cheat:** Leaderboard documents in Firestore are **denormalized and
> server-written**. Cloud Functions aggregate and write `LeaderboardEntry[]`
> atomically; the client MUST NOT write leaderboard data directly.
> `rankEntries` is a read-only sorting helper for data already fetched from
> Firestore (e.g. paginated results arriving out of order, or preview UIs).

---

### `xp.service.ts` — XpService

Angular injectable (`providedIn: 'root'`). Optimistic local helper only.

```ts
import { XpService } from '@forge/gamification';

@Component({ ... })
export class MyComponent {
  private xp = inject(XpService);

  complete(member: Member): Member {
    return this.xp.awardXp(member, 50, new Date().toISOString());
  }
}
```

> **Anti-cheat guarantee:**
> `XpService` is **optimistic / local only** — it lets the UI respond instantly,
> but it is NEVER the authoritative source of truth.
>
> All XP-granting events (course completions, quiz passes, etc.) are validated
> **server-side** by Cloud Functions before any Firestore writes occur:
>
> - The server verifies the event source and integrity.
> - Rate limiting and duplicate-event detection are applied server-side.
> - The server writes the canonical `xp`, `level`, and `streakDays` values to
>   Firestore.
>
> On the next data sync, authoritative server values automatically overwrite the
> optimistic state. The client MUST NOT treat its local XP total as authoritative.

---

## Tags

`scope:shared`, `type:feature`
