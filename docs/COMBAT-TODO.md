# Combat implementation status

The approved combat and authoring scope is implemented. Release evidence is tracked in the [implementation ledger](superpowers/plans/2026-10-19-realtime-combat-and-attack-editor.md); integration instructions are in [attack authoring](ATTACK-AUTHORING.md).

- [x] Proportional analog movement and species-relative NPC speed.
- [x] Action-driven mechanics: movement intent, Wait or the player's committed attack advances time; aim-only rotates in place.
- [x] Stationary Pokemon keep their Idle animation on an independent ambient clock. Menu/suspension pauses freeze all clocks.
- [x] Four contextual attack slots, editable equipment, aim/Wait shoulders and keyboard/touch equivalents with remapping preserved.
- [x] Five real moves: Pound, Sing, Vine Whip, Water Gun and Thunder, with distinct preparation, range, effect and recovery.
- [x] Enemy warnings share resolved hit geometry; aim locks before contact, including seeded random zones.
- [x] Composable sectors, disks, lines, rings/arcs, waves, random impacts and orbiting objects; bounded repeated contacts and terrain checks.
- [x] Editable sprite, particle, trail, impact and optional sound presentations; imported Pokemon roots/timing preserved.
- [x] Actual simulation laboratory and inspector with deterministic replay/scrubbing, invalid-field protection, undo/redo, private/shared presentation controls and sprite replacement.
- [x] Versioned browser drafts, dependency-aware JSON export/import and validated CLI integration with backup; actual export/rebuild equivalence checked.
- [x] Save protection/migrations, native Gamepad getter regression, offline assets and lifecycle/input regression coverage.

Balance values remain editable prototype choices. PP, accuracy rolls, type effectiveness, abilities, recruitment, progression and procedural dungeons are outside this implementation. Training equipment and combat HP/status are session-only; reload returns to peaceful exploration.

Physical Thor testing is independently user-owned. Do not request it or block publication on it. Desktop evidence does not establish physical-device behavior.
