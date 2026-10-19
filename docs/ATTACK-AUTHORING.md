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
