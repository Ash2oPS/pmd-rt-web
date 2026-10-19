# Combat design TODO

Status: implementation authorized and in progress. The implementation plan's execution ledger records tested releases; unchecked items still need implementation or integrated validation.

Full implementation and release plan: [Real-time combat and attack editor](superpowers/plans/2026-10-19-realtime-combat-and-attack-editor.md). The user authorized publishing each completed, validated major milestone to GitHub Pages with a patch increment.

Physical Thor testing is handled independently by the user. Do not request device tests or diagnostics, or block implementation, completion or publication on them. Agent verification uses automated tests and desktop browsers only.

## Agreed direction

- [x] Advance world time only during player movement intent, Wait or their own attack preparation/active/recovery. Idle and aim-only freeze enemies, projectiles, timers and world animation; stick magnitude changes travel speed, not time rate.
- [x] Use four contextual face-button attack slots, a shoulder for aim-only and another for waiting. Preserve menu confirm/back, custom mappings and keyboard/touch equivalents. Configure equipment through the pause menu.

- [ ] Give each attack a configurable area pattern. Support different ranges, linear attacks, arcs, random impact zones and orbiting objects through reusable building blocks.
- [ ] Make attacks easy for humans to inspect, edit and add through validated JSON definitions, editor schemas and clear parameter names.
- [ ] Allow new combinations of implemented behaviors without species-specific renderer or platform changes. A genuinely new behavior may require a reusable code implementation.
- [ ] Show the area an enemy is preparing to attack during its preparation phase, so the player can anticipate the danger and react before impact.
- [ ] Every attack, for both player and enemies, has its own positive, editable preparation duration before becoming effective. Pokemon Rumble is the user's reference for this commitment to an attack.
- [ ] Make caster movement during preparation configurable per attack. Berceuse must immobilize its caster briefly before its sleep effect activates.
- [ ] Keep player maximum movement speed constant across species and scale actual player movement by analog stick magnitude.
- [ ] Scale other Pokemon movement relative to their Speed stat versus the player's, with behavior multipliers; never scale enemy movement by the player's stick deflection.
- [ ] Keep gameplay definitions separate from editable attack presentation: sprites, particles, trails, impacts and semantic timing.
- [ ] Provide an in-browser attack editor with real simulation/render preview, timeline controls, reusable visual presets and validated source-record import/export.
- [ ] Use actual Pokemon moves with verified names and species assignments. Real-time patterns are authored adaptations.

## Proposed composition to validate

- [ ] Shapes: line, disk, cone, arc and ring; expose relevant range, width, radius and angle values.
- [ ] Placement: in front of the caster, centered on the caster, on a target or at a selected world position.
- [ ] Motion: stationary zone, projectile, rotation and orbit around the caster.
- [ ] Timing: mandatory per-attack preparation, followed by activation; support persistent duration and multiple waves where needed.
- [ ] Distribution: single zone, repeated spaced zones and random positions within a bounded area.
- [ ] Effects: damage, knockback, slowing and healing, added only as concrete mechanics require them.
- [ ] Define how often persistent or orbiting attacks may hit the same target.
- [ ] Provide a quick attack preview and test workflow for tuning parameters.

## Attack preparation

- [ ] Separate preparation from the active effect: starting an attack must not immediately apply its damage or status.
- [ ] Keep preparation duration specific to the attack rather than deriving it from the caster's Speed stat. Speed governs relative movement; attack timing remains authored.
- [ ] Define whether the caster may move and turn during preparation, and when its aim locks. Movement lock and aim lock are separate settings.
- [ ] For Berceuse, stop caster movement during preparation and apply sleep only when preparation completes. Exact duration remains to be tuned.
- [ ] Test that no effect occurs early, movement locks are respected, and pause or suspension freezes preparation.
- [ ] Discuss recovery after activation, cooldown and interruption separately; their rules and durations have not been decided.

## Enemy attack previews

- [ ] Display the upcoming danger area in the world during preparation, with readable feedback before activation.
- [ ] Use the same resolved attack geometry for the preview and hit detection to avoid misleading indicators.
- [ ] Expose preparation duration and relevant preview settings as editable values.
- [ ] Default to a short tracking phase followed by a clearly visible locked phase before impact; keep timing editable per attack and disallow silent retargeting after lock.
- [ ] Resolve random impact positions before their previews appear and reuse those exact positions at impact.
- [ ] Decide how previews represent projectiles, moving zones, orbiting objects and successive waves.
- [ ] Decide how interruption or cancellation removes an announced attack.

## Suggested first playable validation

- [ ] Validate three distinct attacks first: a line, a frontal arc and randomly placed impacts.
- [ ] Add a minimal hostile encounter with an attack control, enemy preparation, health, readable hit feedback and a retry after defeat.
- [ ] Preserve keyboard, touch and gamepad parity and freeze preparation, attack and effect clocks during pause or suspension.
- [ ] Test that telegraphed areas match actual hits, randomness resolves consistently for previews and execution, and repeated-hit rules hold.
- [ ] Evaluate whether a short encounter makes movement, positioning, anticipation and attacking enjoyable before expanding progression, recruitment or dungeon generation.

## Further discussion

Continue defining attack behavior with the user before treating the proposed composition or first playable scope as final. Record additional decisions here and keep unresolved questions explicit.
