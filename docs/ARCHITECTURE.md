# Architecture

## Responsibilities

`content/*.json` defines content, not executable behavior. `src/content/` parses it and checks references. `domain/` owns pure state transitions without browser access. `platform/` adapts devices, storage and browser lifecycle. `rendering/` draws supplied state without changing it. `ui/` displays state and emits intent. `app/` wires them together.

The playable field reads its map, spawn and collectible positions from `content/dungeons/awakening-woods.json`. Collectible `itemId` values reference the item catalog. Version-1 saves store collectible indexes: preserve their order unless introducing a save migration.

## Dependencies

| Layer | Allowed dependencies |
| --- | --- |
| content | content, content JSON, Zod |
| domain | domain, content |
| platform | platform, domain, content |
| rendering | rendering, domain, content |
| ui | ui, domain, content, pure input mapping and input types |
| app | All layers for composition |

No circular imports, including type-only cycles. Do not route forbidden dependencies through barrels or dynamic imports. The checker follows relative imports and exports.

## Adding behavior

First add a focused pure domain function and a behavioral test. Connect it to input/menus through app composition. Render the resulting state. A creature using existing mechanics should need JSON changes, not a renderer branch for its species ID.

Only moves with a validated `combat` definition are playable. `domain/combat/` owns transient training entities, shared terrain-clipped sector geometry, preparation/tracking/lock, active contact, recovery/cooldown and damage. Other move/effect and ability IDs remain reference-only. Avoid arbitrary script strings, `eval` or speculative plugin systems.

## Saves

`src/domain/state.ts` validates version-2 continuous positions and migrates version-1 tile-center saves without losing progress. The existing `pmd-field-save-v1` storage key is retained; the embedded version identifies the format. Version 2 adds actual traveled `distance`; `steps` is its integer part. `src/platform/storage.ts` preserves original save and binding storage keys. Future schema changes require explicit tested migrations. Reject unknown future versions.

## Real-time field

`domain/movement.ts` owns continuous tile-center coordinates, circular collision, swept movement, wall sliding, eight-way facing and pickup proximity. `platform/input/movement.ts` preserves analog magnitude with a radial deadzone and normalizes digital diagonals. The app advances movement and independent `domain/roaming.ts` actors only while play is active. During training, Encounter owns the authoritative NPCs; the Pokemon adapter only samples/draws these actors. Rendering sorts actors and the player by vertical position. NPCs collide with terrain and remain non-solid to other creatures. Deadzone preferences are separate from remaps. Blur clears movement and requires stick release without pausing the world.

Training is explicitly started from the pause menu. Combat HP, casts and enemies are transient; reload/import returns to peaceful exploration and never resumes a pending attack. Starting/retrying creates a fresh encounter with a one-second enemy grace interval. The original exploration save format remains unchanged. Combat result navigation supports keyboard, touch and gamepad. Cosmetic time continues after a result to expire final impacts, but freezes with normal pause/suspension.

The action-driven world clock supersedes free-running simulation: `domain/action-clock.ts` advances time only for player movement intent, held Wait or an ongoing player cast (including recovery). Aim-only changes facing without translation or time. Enemy attacks, statuses and projectiles cannot advance time on their own. All domain and world-animation updates receive this same gated delta. After an encounter ends, only final cosmetic feedback finishes on the result UI clock; gameplay remains frozen, and normal pause freezes both clocks. Input decoding separates play face-button attacks from menu confirm/back, and a release gate prevents a held final attack from activating result commands.

`content/settings/movement.json` defines the player's species-independent maximum speed and the bounded relative Speed-stat curve. `domain/speed.ts` resolves NPC speed relative to the player's stat and maximum, with a separate authored roaming behavior multiplier. Stick deflection changes only actual player movement. Active analog axes take precedence over duplicated default digital signals; explicit custom mappings remain active. Diagnostics expose the movement source, raw magnitude and actual resolved player speed.

## Size and growth

TypeScript modules above 350 lines fail; 300 produces a warning. Split by responsibility and change frequency, not arbitrary line ranges. Keep styles focused as well. Generated manifests may exceed the line budget; handwritten safety and dependency checks still apply.

These checks catch common mistakes, not every design problem. Review whether each public API and import list matches the module's purpose.
