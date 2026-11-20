# Soteria Forge Core

Connects a Unity build to a Soteria Forge lesson. The contract is
`docs/unity-cmi5-contract.md`: launch parameters in, xAPI statements out.

## Use

1. Add a `ForgeLesson` component to one GameObject in the first scene.
2. Report what the learner does:

```csharp
var lesson = ForgeLesson.Current;
lesson.Record("isolated-energy", "isolated energy");   // in-game event
lesson.Completed();                                    // experienced the content
lesson.Passed(0.9f);                                   // or lesson.Failed(0.4f)
await lesson.EndAsync();                               // sends `terminated`
```

`ForgeLesson` reads the launch from the page URL (WebGL). Without launch
parameters, as in the Editor, it runs in preview mode: calls are logged and
nothing is sent.

## Rules the server enforces (mirrored here so a game cannot trip them)

- `Completed` once per session; one of `Passed` / `Failed` per session.
- Nothing is accepted after `EndAsync`.
- The lesson completes on `Completed` or `Passed`. `Failed` alone does not.
- Scores are scaled, -1 to 1.

## Delivery

Statements are sent one at a time, in order. A network failure or a 5xx is
retried with backoff; a 4xx other than 401/403 drops that statement and logs why;
401/403 means the launch has ended and the learner must reopen the lesson.
The queue is in memory: statements still unsent when the page closes are lost.
