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

Starter effect IDs describe planned behavior. No combat/effect engine exists yet. When adding one, create a typed registry of implemented handlers, validate references and test behavior before marking an effect playable. Avoid arbitrary script strings, `eval` or speculative plugin systems.

## Saves

`src/domain/state.ts` validates version-2 continuous positions and migrates version-1 tile-center saves without losing progress. The existing `pmd-field-save-v1` storage key is retained; the embedded version identifies the format. Version 2 adds actual traveled `distance`; `steps` is its integer part. `src/platform/storage.ts` preserves original save and binding storage keys. Future schema changes require explicit tested migrations. Reject unknown future versions.

## Real-time field

`domain/movement.ts` owns continuous tile-center coordinates, circular collision, swept movement, wall sliding, eight-way facing and pickup proximity. `platform/input/movement.ts` preserves analog magnitude with a radial deadzone and normalizes digital diagonals. The app advances movement and independent `domain/roaming.ts` actors only while play is active. Rendering sorts actors and the player by vertical position. NPCs collide with terrain and remain non-solid to other creatures; no combat or creature-pushing mechanic exists. Deadzone preferences are separate from remaps. Blur clears movement and requires stick release without pausing the world.

## Size and growth

TypeScript modules above 350 lines fail; 300 produces a warning. Split by responsibility and change frequency, not arbitrary line ranges. Keep styles focused as well. Generated manifests may exceed the line budget; handwritten safety and dependency checks still apply.

These checks catch common mistakes, not every design problem. Review whether each public API and import list matches the module's purpose.
