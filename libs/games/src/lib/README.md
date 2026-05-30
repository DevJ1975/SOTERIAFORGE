# @assurance/games

Interactive card-game shells and game-engine integrations for the SOTERIAFORGE platform.

## Overview

This library provides Angular standalone components that wrap three different game engines and expose a unified, no-code–configurable interface for learner-facing mini-games.

| Component                | Engine                  | Selector               |
| ------------------------ | ----------------------- | ---------------------- |
| `PhaserHostComponent`    | Phaser 3                | `forge-phaser-host`    |
| `RiveCharacterComponent` | Rive (@rive-app/canvas) | `forge-rive-character` |
| `UnityEmbedComponent`    | Unity WebGL (cmi5/xAPI) | `forge-unity-embed`    |

## Key design decisions

### Lazy / dynamic imports

All three game engines (Phaser, Rive, Unity) are heavy dependencies. They are loaded at runtime via `import()` — **never** at module scope — so:

- SSR (Angular Universal / `@angular/ssr`) does not crash on missing browser globals (`window`, `document`, `WebGL`).
- jsdom (Jest test environment) is not polluted by WebGL / Canvas APIs.
- The host app's initial bundle stays small.

### @defer loading

Host apps should wrap these components with Angular's `@defer` block so the component code itself is only downloaded when needed:

```html
@defer (on viewport) {
<forge-phaser-host [config]="gameConfig" (completed)="onComplete()" />
}
```

### SSR guard pattern

Each component checks `isPlatformBrowser(PLATFORM_ID)` before initialising the engine, and uses `afterNextRender()` to ensure the DOM is ready before touching the canvas.

---

## Components

### PhaserHostComponent

Accepts a `CardGameConfig` (discriminated union — see `card-game.model.ts`) and renders a fully interactive Phaser 3 scene. Emits `(completed)` when the learner finishes the game.

Four game modes are supported:

| `kind`           | Interaction                                                         |
| ---------------- | ------------------------------------------------------------------- |
| `flip_reveal`    | Click cards to flip; complete when all revealed                     |
| `match_pairs`    | Click two matching cards; complete when all pairs matched           |
| `sort_buckets`   | Click each card to cycle through buckets; complete when all sorted  |
| `scenario_cards` | Read a prompt and choose a response; advances through all scenarios |

Phaser is only imported inside `initPhaser()` which is guarded by both `isPlatformBrowser` and a canvas-context check, so jsdom tests never load Phaser.

```html
<forge-phaser-host [config]="myFlipRevealConfig" (completed)="handleComplete()" />
```

### RiveCharacterComponent

Renders an animated Rive character. Exposes `setTrigger(name)` to fire state-machine inputs at runtime (e.g. `'correct'`, `'incorrect'`, `'encouragement'`).

```html
<forge-rive-character
  [src]="'/assets/character.riv'"
  [stateMachine]="'MainStateMachine'"
  #riveChar
/>
```

```ts
@ViewChild(RiveCharacterComponent) riveChar!: RiveCharacterComponent;

onCorrectAnswer() {
  this.riveChar.setTrigger('correct');
}
```

### UnityEmbedComponent

Embeds a Unity WebGL build inside a responsive, sandboxed `<iframe>`.

**Reporting path:** The authoritative xAPI / cmi5 reporting path runs directly from the Unity runtime to the LRS via the cmi5 launch URL parameters. The `(signal)` output is a lightweight, optional side-channel for non-cmi5 shell messages only (e.g. UI overlays).

Cross-reference: **`docs/unity-cmi5-contract.md`** — defines the full cmi5 launch URL contract, required parameters, and the expected xAPI statement sequence.

```html
<forge-unity-embed
  [launchUrl]="cmi5LaunchUrl"
  [title]="'Safety Training Module'"
  (signal)="handleShellMessage($event)"
/>
```

---

## Card-game model

`CardGameConfig` is a discriminated union with four kinds:

| Kind             | Description                                      |
| ---------------- | ------------------------------------------------ |
| `flip_reveal`    | Cards with hidden faces; learner flips to reveal |
| `match_pairs`    | Memory / match-pairs game                        |
| `sort_buckets`   | Drag-and-drop cards into labelled buckets        |
| `scenario_cards` | Read a situation, pick the best response         |

Use `validateCardGameConfig(config)` to get an array of validation error strings before persisting to Firestore. An empty array means the config is valid.
