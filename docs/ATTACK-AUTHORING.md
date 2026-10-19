# Attack authoring

Open **Atelier capacités** from the pause menu or visit `lab.html` beside the game. The laboratory uses the same encounter simulation, collision geometry, Pokemon drawing and attack overlays as live training. Its playback transport advances simulation explicitly; the live game's action clock remains unchanged.

## Inspect and reproduce

- Select an official move or a clearly labeled technical demonstration.
- Choose a compatible caster, target distance, facing and random seed.
- Replay, pause, step, slow playback or scrub the timeline. Backward scrubbing resets and replays the same seeded simulation, rather than reversing mutable objects.
- The dummy is a passive hostile with extra test HP; these settings never modify production species or the exploration save.
- The laboratory, currently loaded sprites and generated build assets work offline after the first completed visit. Assets for a caster not yet loaded still require an initial online load.

## Source records

Official moves live under `content/moves/<id>.json`; technical demonstrations live under `content/lab-fixtures/lab-<id>.json` and are deliberately excluded from the official catalog. Both use the generated move schema. Preserve IDs and verify species compatibility before presenting a move as official.

Simple attacks describe a sector, self disk, target disk or projectile. The `zones` pattern composes shape, placement, distribution, motion, waves and hit policy. It supports rings/arcs, random positions, repeated waves, persistent areas and orbiting objects. All random placements are resolved before their warning appears. Counts, placement attempts and hit frequency are bounded and invalid definitions are rejected.

Orbit trajectories and their actual objects respect terrain visibility from the orbit center. Occluded objects cannot deal damage and are not drawn as active danger. Cosmetic overlays never determine hits.

After source edits, run `npm run content:generate` and `npm run build`, then verify the production browser flows with `npm run test:browser`. Never edit generated schemas or the offline worker by hand.

## Presentation records

The visual direction follows the existing muted forest palette and outlined pixel sprites: compact readable bursts, sparse particles and bright danger contours. The live preview is the main workspace; presentation controls are secondary to the actual result.

`content/attack-visuals/<id>.json` contains reusable tracks and optional synthesized sound. `baseId` inherits tracks by stable track ID. A move selects `visualId` and can override individual nonidentity fields with `visualOverrides[trackId]`; sparse overrides preserve inherited values. Presentation edits do not alter preparation, contact geometry or damage.

Tracks bind to preparation, lock, activation, hit, projectile, zone or cancellation. Sprites have local asset references, size in pixels, world-tile offsets, phase delay/duration and drawing layer. Particle count, speed, spread and trail length are editable. Budgets limit each frame to 256 particles and 64 combined sprites/trails; reduced motion reduces decoration without removing telegraphs. A nonprojectile trail extends forward, while projectile trails follow their actual path.

`content/effect-assets/<id>.json` defines a local sprite/sheet, frame dimensions/count/timing and provenance. The initial six SVG sprites under `public/effects/` are project-authored pixel assets, separate from pinned SpriteCollab imports. Sheet dimensions and loading errors are checked before combat is ready. Existing Pokemon roots and authored frame durations are preserved; an Attack animation holds before its source contact frame until the simulation activates, then finishes without looping.

Sound is optional and unlocked by a browser-recognized user gesture. The pause menu offers a separately persisted mute setting. The laboratory never plays sounds while scrubbing. Final cosmetic impacts finish on the result UI clock while gameplay stays frozen.
