# Soteria Forge design kit: instructions for Claude

This folder is the source of truth for how Soteria Forge looks. Read this file before building or changing any Forge UI.

## Rules
1. **Colors, type, spacing, radius, shadows, motion:** use the tokens in `tokens/tokens.css` (CSS variables, `--sf-*`) or `tokens/tailwind.preset.js`. Never hard-code a hex value that a token already covers.
2. **Components:** start from `components/forge.css` (`sf-*` classes) and copy the markup patterns in `components/components.html`. Keep class names when porting to React, Vue or Svelte.
3. **Font:** Inter, loaded from `fonts/inter.css` (self-hosted woff2, weights 400–800).
4. **Icons:** `icons/*.svg`, 24 × 24, 1.8 stroke, `currentColor`, round caps and joins. New icons must follow the same grid and stroke. Never use emoji as UI icons.
5. **Logo:** use the files in `logo/` as-is (text is outlined). Do not recolor, stretch or recreate the shield. Keep clear space of half the shield's width around the lockup.
6. **SFG brand** (navy #0B3D5C, gold #F2A900, `logo/sfg/`) appears only in the "Built by Synergy Federal Group" line, the SFG lockup and SFG-issued credentials. Forge screens use Forge colors.

## Look and feel
- Light app: cream canvas (`--sf-cream`), white cards (16 px radius, 1 px `--sf-line` border), charcoal 88 px icon rail on the left, 64 px white top bar.
- Ember (`--sf-ember`) is the one accent: primary buttons, active rail item (charcoal tile + 3 px ember bar), progress, the risk path in AI diagrams. Use it sparingly.
- Success green means correct, online, earned, or "the fix."
- Forge Engage (live class) is dark: `--sf-dark-bg` background, `--sf-dark-pane` panels, gold timers and scores.
- Buttons are 44 px tall with 12 px radius; primary = ember, secondary = white with a line border, destructive = red.
- Earned badges use the ember radial gradient; credentials use the gold gradient; locked or upcoming badges are dashed and grey.

## Accessibility (WCAG 2.2 AA)
- Text contrast at least 4.5:1. Ember text on the soft ember tint uses `--sf-ember-on-soft` (#B33A12).
- Every state that uses color also uses a word or icon (✓, "in progress," "locked").
- Visible focus ring on every control (`:focus-visible`, ember at 45%).
- Icon-only buttons need `aria-label`. Respect `prefers-reduced-motion` (tokens already zero the durations).
- Touch targets at least 44 px.

## Product rules the UI must keep (from SFG-SPC-FRG-011)
- Leaderboards show crews only; individual scores are private to the learner and instructor.
- The AI coach never grades and always shows its sources.
- Captions on by default on lesson video.

## Files
- `tokens/` tokens.css, tokens.json (W3C design-tokens format), tailwind.preset.js
- `components/` forge.css, components.html (live sheet), components-preview.png
- `icons/` 28 SVG icons + `_sprite.svg` (use `<svg><use href="_sprite.svg#sf-home"/></svg>`)
- `logo/` Forge shield and lockups (SVG + PNG), favicon.ico, `sfg/` parent-brand marks
- `fonts/` Inter woff2 + inter.css
- `reference/` screen stills from the walkthrough video and the full HTML prototype (`forge_ui_prototype.html`, call `setT('home', 10, 18)` in the console to view a scene)
