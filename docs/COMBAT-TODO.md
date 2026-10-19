# Combat implementation status

Combat is moving into the persistent exploration field in three patch releases. Evidence and commits are tracked in the [implementation ledger](superpowers/plans/2026-10-19-realtime-combat-and-attack-editor.md); attack editing remains in the separate [authoring workshop](ATTACK-AUTHORING.md).

## Delivered in 0.4.11

- [x] Field actor teams come from content: Bulbizarre is explicitly hostile and other actors default to neutral.
- [x] One persistent `Encounter` owns field actor positions for rendering and combat; actors do not respawn when entering a separate player mode.
- [x] The exploration HUD's four slots launch equipped attacks; defeating Bulbizarre does not end field play.
- [x] The pause menu no longer offers a training start button. The ability workshop remains separate.
- [x] Action-driven time, neutral roaming and ambient Idle animation retain their existing clocks.

## Next releases

- [ ] 0.4.12: hostile awareness after player action and clear line of sight, approach, real-move telegraphs, field counterplay, and same-map recovery after K.O.
- [ ] 0.4.13: verify save-before-recovery, pause/suspension/blur/reload, transient combat reset, offline behavior, and final documentation against the production build.

The five authored moves, collision geometry, projectile/effect system, attack editor, and rendering remain shared with the workshop. PP, accuracy rolls, type effectiveness, abilities, recruitment, progression and procedural dungeons remain outside scope. HP, statuses and pending attacks are not part of the field save.

Physical Thor testing is independently user-owned. Desktop evidence does not establish hardware behavior; it is not a release gate.
