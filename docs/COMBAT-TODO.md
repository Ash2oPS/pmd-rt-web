# Combat implementation status

Combat is moving into the persistent exploration field in three patch releases. Evidence and commits are tracked in the [implementation ledger](superpowers/plans/2026-10-19-realtime-combat-and-attack-editor.md); attack editing remains in the separate [authoring workshop](ATTACK-AUTHORING.md).

## Delivered in 0.4.11

- [x] Field actor teams come from content: Bulbizarre is explicitly hostile and other actors default to neutral.
- [x] One persistent `Encounter` owns field actor positions for rendering and combat; actors do not respawn when entering a separate player mode.
- [x] The exploration HUD's four slots launch equipped attacks; defeating Bulbizarre does not end field play.
- [x] The pause menu no longer offers a training start button. The ability workshop remains separate.
- [x] Action-driven time, neutral roaming and ambient Idle animation retain their existing clocks.

## Delivered in 0.4.12

- [x] Bulbizarre notices only during an advancing action, within its authored notice range and with a clear line of sight; it then approaches.
- [x] Hostiles announce only moves in their learnsets. The warning and contact share locked geometry, allowing the player to dodge and riposte.
- [x] Defeated enemies stay removed while exploration continues. A K.O. saves position and collected items before offering same-map recovery; hostiles reset and neutral positions persist.

## Delivered in 0.4.13

- [x] K.O. saves the current position and collected items before showing recovery; health, statuses, awareness and pending attacks stay transient.
- [x] Pause and suspension freeze the field encounter until explicit resume. Blur clears input and saves without opening pause.
- [x] New encounters and reloads discard pending combat, restore enemy positions and start with one second of grace.
- [x] Production browser checks cover offline reload/update; the published site and offline cache are verified under `/pmd-rt-web/`.

The five authored moves, collision geometry, projectile/effect system, attack editor, and rendering remain shared with the workshop. PP, accuracy rolls, type effectiveness, abilities, recruitment, progression and procedural dungeons remain outside scope. HP, statuses and pending attacks are not part of the field save.

Physical Thor testing is independently user-owned. Desktop evidence does not establish hardware behavior; it is not a release gate.
