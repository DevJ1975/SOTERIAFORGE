# Games

`forge-unity/` is the one Unity project for Soteria Forge simulators and the RPG
(Unity 6000.6.10f1, URP). Plan: [docs/unity-games-plan.md](../docs/unity-games-plan.md).
Contract with the platform: [docs/unity-cmi5-contract.md](../docs/unity-cmi5-contract.md).

- `Packages/com.soteriaforge.core` — connects a build to the lesson that launched it.
  See its README.
- `Assets/Drill` — a plain lockout/tagout ordering drill. It is a pipeline test, not
  training content. Attach `lockout-drill.scenario.json` to its lesson
  (`PUT /api/standards/lessons/{id}/scenario`) and the server scores the run itself.
- `Assets/Editor/ForgeBuild.cs` — batch entry points.

```sh
cd games/forge-unity
unity test . --mode EditMode                      # package tests
unity run . -- -executeMethod SoteriaForge.EditorTools.ForgeBuild.BuildWebGL   # Builds/WebGL
```

The WebGL build needs the editor's **Web Build Support** module. Host `Builds/WebGL`
on an origin that is neither the learner app nor the API, set a `unity` lesson's
external URL to its `index.html`, publish the course and open the lesson.
