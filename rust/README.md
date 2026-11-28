# forge-sim: simulator rules in Rust

Deterministic rules and scoring for Soteria Forge simulators, shared by the game and
the server. The game sends the server its **action log**, never a score; Django replays
the log with this same code and records the score it computes. See
[docs/unity-games-plan.md](../docs/unity-games-plan.md), Phase 4.

| Crate           | What it is                                   | Used by                     |
| --------------- | -------------------------------------------- | --------------------------- |
| `forge-sim`     | The rules. Pure Rust, no I/O.                | The two crates below        |
| `forge-sim-ffi` | C ABI (`forge_sim_replay`, `forge_sim_free`) | Unity, through P/Invoke     |
| `forge-sim-py`  | Python module `forge_sim` (PyO3)             | Django, `apps/games/sim.py` |

## What it does today

One mechanic: a **procedure** scenario. Steps have points and prerequisites; a step
done before its prerequisites earns nothing and costs a penalty; the launch seed picks
one of the scenario's faults, which makes extra steps required for that run. The sample
scenario in `forge-sim/tests/replay.rs` is a lockout/tagout procedure and is an
illustration, not reviewed safety content.

## Work on it

```sh
cd rust
cargo test                                 # rules, C ABI
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

Build the Python module into the backend's environment, then run the Django tests:

```sh
cd rust
uvx maturin build --release -m forge-sim-py/Cargo.toml -i ../backend/.venv/bin/python
cd ../backend
uv pip install --force-reinstall ../rust/target/wheels/forge_sim-*.whl
uv run pytest tests/test_sim.py
```

`uv run` keeps the module installed; **`uv sync` removes it** (it isn't in
`pyproject.toml` yet), so rebuild after a sync. Without it `tests/test_sim.py` is
skipped and `apps.games.sim` answers 503.

## Rules for changing the rules

A replay must give the same answer on a phone, in a browser and on the server.

- No I/O, clock, threads or global state in `forge-sim`.
- Integers only for anything that reaches the score. No floats.
- Randomness only from `forge_sim::Rng`, seeded by the launch. Its output is pinned by
  a test; changing it breaks every recorded log.
- Any change that could alter an outcome bumps `RULES_VERSION`. A log is replayed with
  the version it was recorded under.

## Not done yet

- **Not played end to end.** The cmi5 statements endpoint replays the action log of a
  lesson with a scenario attached (docs/unity-cmi5-contract.md, section 5) and the
  Unity package sends it, but no WebGL build has been run against such a lesson yet.
- **Not in the API image.** CI builds the Linux wheel on every run and the backend job
  tests against it. Pushing a tag `forge-sim-v<version>` (matching `rust/Cargo.toml`)
  publishes the wheel and its SHA-256 as a GitHub release. Still to do after the first
  release: have `backend/Dockerfile` download that wheel, check the hash and install it.
- **Unity builds.** The C ABI is tested from Rust only. Building it for iOS
  (`aarch64-apple-ios`, static), Android (`aarch64-linux-android`) and WebGL is the
  Phase 0 spike.
- **Old rules versions.** Only the current `RULES_VERSION` can be replayed.
