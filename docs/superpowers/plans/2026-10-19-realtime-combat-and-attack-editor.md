# Real-time combat and attack editor implementation plan

## Goal and status

Deliver readable, enjoyable real-time Pokemon combat with human-editable attack patterns, preparation, effects and visuals, plus an in-browser attack editor using the actual game simulation and renderer.

Execution started on 2026-10-19 at the user's request. The user authorized pushing and publishing each completed major milestone to GitHub Pages with a patch increment. Completion and evidence are recorded below; unchecked tasks are not claims of implemented behavior.

## Execution ledger

Dependency chain: baseline -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7. Within a milestone, parallel work is allowed only with disjoint ownership and agreed contracts. Root owns integration, version changes, commits, publication and evidence. Each milestone receives a focused review of its concrete diff before release.

| Task | Owner / write scope | Dependencies | Evidence / status |
| --- | --- | --- | --- |
| B0 | Root: baseline and release documentation | None | Starting commit `0fd8a73`; main matches origin; build passes 63 tests; all 29 production browser checks pass; compact baseline screenshot inspected |
| M1 | Speed worker: movement/input/schema/content integration and focused tests | B0 | Implemented; 69 unit tests and all 30 browser checks pass (final input change rechecked with 6 real-time browser flows) |
| R1 | Root/reviewer: scoped review, version, production tests and deployment | M1 | Published 0.4.1 commit `648502a`; Actions run `39228435070` succeeded; live sprite readiness and movement verified |
| M2 | Domain worker: combat/schema/tests; renderer worker: cues; root: app/input/HUD | M1 local validation | Implemented; 80 unit tests and all 32 production browser flows pass |
| R2 | Root/reviewer: result parity, impact expiry, version and deployment | M2 | Published 0.4.2 commit `f8bbcc3`; Actions run `39229943931` succeeded; live training and Pound preparation verified |
| H1 | Root: native Gamepad fix isolated from unfinished M3 | M2 | Published 0.4.3 commit `10590ff`; 81 tests, 32 browser flows and native-prototype browser reproduction pass; Actions `39232658638` succeeded and live movement/animation verified |
| M3 | Domain workers: patterns/status/projectiles/damage/action clock; UI worker: contextual slots; root: integration | M2 local validation | Published 0.4.4 commit `1b1bcb8`; Actions `39233298331` succeeded; live idle freeze and Wait verified; 98 unit tests and 36 browser flows |
| M4 | Domain worker: zones/schema/hit ledger; renderer: zones; root: actual lab and integration | M3 local validation | Published 0.4.5 commit `4b18208`; Actions `39234589735` succeeded; live lab orbit verified; 108 tests and advanced-pattern browser checks |
| M5 | Content worker: visual graph; renderer: bounded presentation; platform: assets/audio; root: integration | M4 local validation | Published 0.4.6 commit `4239ae7`; Actions `39236446337` succeeded; live water effects verified; 123 tests and all browser suites pass |
| M6 | Authoring workers: document/drafts, inspector, bundle integration; root: live preview and regressions | M5 | Published 0.4.7 commit `7d28298`; Actions `39239836879` succeeded; live Idle animation/editor verified; 138 unit tests, all browser suites including six editor flows; actual UI export applied and rebuilt in an isolated project copy with concurrent edits preserved; stationary Idle animation regression passes |
| M7 | Root: integrated quality, CI evidence and final publication | M6 | Published 0.4.8 commit `c01791c`; Actions `39240611126` succeeded; live Idle animation/editor/orbit verified. 139 unit tests and all production browser suites pass, including seven editor checks; concurrent enemy warning/contact regression passes; 64-zone desktop sample p50 9.4 ms / p95 13.1 ms (280 frames); native sprite QA checks 1,896 frames with no errors; CI captures every browser suite. The live existing-session update exposed stale HTTP HTML during worker installation; H2 below closes that release gate. |
| H2 | Root: offline update regression and content-growth checks | M7 | Published 0.4.9 commit `65ac233`; Actions `39241587180` succeeded. Reproduced and fixed stale HTTP HTML during worker installation. All browser suites pass, including the two-version update regression. Live 0.4.8 session stayed intact until closure, then reopened at 0.4.9. Additional-move project copy rebuilt and passed the advanced-pattern and seven editor flows. |

Existing dirty files before execution belong to the preceding authorized save-protection/CRLF fixes and this combat planning discussion. Preserve and include those reviewed changes in the first release checkpoint; do not stage unrelated later edits automatically.

The user owns all physical Thor testing independently. Do not request device tests, diagnostics or hardware access, and do not make them an acceptance criterion or release gate. Agent verification covers source, automated tests, desktop browser behavior and deployment; it must never be described as physical-device verification.

Read `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, `docs/CONTENT.md` and `docs/ASSETS.md` before execution. Preserve existing uncommitted changes, including the authorized save-protection and CRLF fixes; establish ownership before staging anything. Do not modify either MonsterPlayable repository.

## 1. Design contract

### Confirmed change after the implementation pause

Later clarification: stationary Pokemon must keep their Idle animations alive. Ambient visual animation therefore uses an unpaused presentation clock independent of action-driven simulation. Mechanical attack frames remain tied to attack phases; positions, projectiles, statuses and cooldowns still freeze at rest. Real pause/suspension freezes both clocks. This supersedes the older blanket freeze of all world animation.

The user replaced the free-running world with action-driven time. At rest, enemies, roaming, projectiles, attack phases, statuses and cooldowns all freeze; ambient Idle animation stays alive as clarified above. Time advances at normal speed while the player intends to move, holds Wait, or commits to their own preparation/active/recovery phases. Stick magnitude changes only player travel speed, never the rate of advancing time. Enemy activity alone cannot restart time. Aim-only rotates the player in place without starting time; a locked attack keeps its resolved direction. A player sleep status alone is not a reason to advance time.

Four face buttons launch four equipped moves directly in play. Menus retain east A confirm/south B back; Start opens pause. One shoulder (default L) enables aim-only; the other (default R) waits. Keyboard and touch equivalents and remaps are required. The HUD uses the physical face-button diamond; empty slots stay visibly disabled. Equipment is selected in the pause menu from the species' implemented moves. These decisions supersede older two-slot and free-running-time assumptions below and ship with M3.

### Confirmed requirements

- Player maximum movement speed is constant regardless of the controlled species' Speed stat. Stick deflection controls actual speed below that maximum; keyboard and digital controls use full magnitude with normalized diagonals.
- Other Pokemon move relative to their Speed stat compared with the player's Speed stat. While world time advances, their speed is independent of stick magnitude; at rest the action clock stops their movement.
- Movement and attack timing are independent. Every attack has its own positive preparation duration, for player and enemies alike.
- Berceuse immobilizes its caster during preparation and only applies sleep afterward. Whether other attacks allow movement is authored per attack.
- Enemy preparation shows the upcoming danger area. The default briefly tracks the target, then locks aim before impact. Once locked, the attack cannot silently retarget.
- Attack definitions combine reusable area shapes, placement, motion, distribution, timing and effects. New combinations use data; genuinely new mechanics require one reusable implementation.
- Support linear attacks, ranges, frontal arcs, random zones, persistent zones, waves and objects orbiting their caster.
- Use real Pokemon moves and coherent species assignments. Their real-time geometry is an adaptation, not a claim that main-series games use those hitboxes.
- Visuals include coherent sprites/animation, type-appropriate particles, trails and impacts. Humans can edit each component efficiently with live preview.
- Preserve existing exploration, controls/remapping, saves, lifecycle and offline behavior. Pause/suspension freezes combat, AI, animation and visual clocks; blur clears input without pausing.

### Proposed defaults to test, not immutable rules

- Relative speed: `enemySpeed = playerMaxSpeed * clamp((enemyStat / playerStat) ** exponent, minRatio, maxRatio) * behaviorMultiplier`.
- Start with exponent `0.5`, minimum ratio `0.6`, maximum ratio `1.6`; use existing authored species Speed values. Put these values in an editable movement settings record with generated schema.
- Roaming uses a lower behavior multiplier than pursuit. Resolve speed centrally for all non-player movement, including friendly roamers; changing species must not require a renderer branch.
- Define tracking as an initial portion of preparation, followed by a positive locked interval. Validate that tracking cannot consume the entire preparation. Example durations from discussion were illustrative only.
- Stop enemy translation at aim lock for the first stationary attacks. Explicit mobile attacks may override this, with a preview of the trajectory or moving danger.
- Resolve random impact locations before revealing them, then reuse those locations for activation. Do not redraw randomness at impact.
- First release uses no random accuracy misses: dodging depends on geometry. Preserve catalog accuracy/PP as reference values until their playable policies are explicitly designed.
- Start with no attack queue and no overlapping player casts. Recovery and cooldown are separate per-move values; initial values are balance choices, not Speed-derived.

### Questions to settle at the relevant milestone

- Controller buttons for attack slots, keyboard keys and touch layout; preserve east A confirmation, south B back and existing custom mappings.
- Initial number of equipped moves: propose two slots for the first encounter and up to four by the editor milestone.
- Damage/status interruption rules, sleep duration and wake-on-hit behavior; friendly fire, projectile piercing and creature solidity.
- First combat scope: explicitly selected hostile actors, while keeping other visitors neutral. Do not turn every visitor hostile implicitly.
- Persistent health/loadouts versus encounter reset on reload; see save policy below.
- Which official move/species legitimately demonstrates orbiting objects. Build the primitive and its lab fixture without inventing an official move or misrepresenting a reference move.

These are bounded implementation decisions to review with concrete previews. Do not block unrelated preparation on them or silently describe provisional rules as approved.

## 2. Starting point and integration boundaries

Current code is Canvas 2D, strict TypeScript, Vite and Zod. Species stats and six reference moves exist; playable combat does not. Attack/Hurt sprite sheets and frame metadata are imported but normal runtime loading currently requests Idle/Walk. Analog magnitude is already supported by source code and focused tests. Investigate the reported full-speed behavior through code inspection and simulated input sources; physical Thor checks belong to the user outside this plan.

| Responsibility | Existing integration | Planned ownership |
| --- | --- | --- |
| Content/schema generation | `src/content/schemas.ts`, `validate.ts`, `scripts/content.mts` | Focused attack, presentation, effect-asset and movement schemas; explicit category registration |
| Movement | `src/domain/movement.ts`, `roaming.ts` | Pure relative-speed resolver; preserve swept circle collision and analog magnitude |
| Combat | No existing combat subsystem | `src/domain/combat/`: entities, geometry, cast lifecycle, motion, hits, statuses, AI |
| Composition | `src/app/main.ts`, `runtime.ts`, `pokemon.ts` | App-owned encounter runtime connects domain, assets, renderer, inputs and editor |
| Drawing | `src/rendering/renderer.ts`, `pokemon.ts` | Telegraph, effect and particle renderers consume resolved snapshots/events |
| Browser services | `src/platform/` | Input extensions, local effect assets, audio and authoring import/export |
| Presentation | `src/ui/` | Minimal combat HUD and editor controls emitting intents |

Names are indicative. Add modules only for responsibilities actually implemented. Keep the existing allowed layer directions; editor UI must not import the renderer or browser adapters directly. App composition supplies preview and save callbacks. Domain emits typed simulation events, never browser effects. Keep modules below 350 lines and avoid growing `main.ts` into the combat implementation.

## 3. Data and authoring model

- Keep move identity and reference values in `content/moves/<id>.json`. Add an optional typed combat definition or a stable reference to one; catalog-only moves must remain valid and explicitly unavailable in combat.
- Keep reusable presentation records in `content/attack-visuals/<id>.json`, local effect assets in `content/effect-assets/<id>.json`, and movement settings in `content/settings/<id>.json`. Register each category in schemas, catalog, generation, editor completion and validation tests.
- Use a discriminated union of implemented shape/motion/effect types, finite bounds and reference validation. Reject impossible combinations instead of silently falling back to a different attack.
- Include world units in field labels: distances in tiles, durations in seconds, angles in degrees, angular velocity in degrees/second. Convert once at the appropriate boundary.
- An attack describes preparation, aim tracking/lock, caster movement/turn policy, active duration, recovery/cooldown, geometry, distribution, motion, hit policy, effects and presentation reference.
- A hit policy states once-per-cast, once-per-projectile or periodic-per-target with an explicit interval and optional maximum count. A render frame must never determine hit frequency.
- Resolve defaults/preset overrides once into a validated definition. Show inherited and overridden values in the editor; a species elemental type must not silently choose the move's appearance.
- Visual tracks bind to semantic events such as preparation start, aim lock, activation, projectile spawn, hit, miss/expiry and cancellation. Each component has asset, anchor, offset, direction policy, layer, delay, duration and supported particle/trail parameters.
- Assets use stable IDs, local safe paths, frame dimensions/timing, pivots, directional support and source/license/artist metadata. Swapping a sprite preserves gameplay geometry.
- Export schema-versioned authoring documents and test their round trip. No executable expressions, arbitrary scripts or generic plugin language in JSON.

## 4. Simulation and rendering invariants

1. A cast moves through preparing/tracking, preparing/locked, active and recovery; cooldown is an independent availability timer. Resolve phase boundaries in simulation time, including a tick crossing multiple boundaries.
2. Assign stable cast/projectile/event IDs. Domain randomness uses a dedicated seed per cast, independent of cosmetic randomness and frame rate.
3. The cast owns resolved origin, facing, targets and random zones. Preview and hit detection read this same resolved data. Visual particles never determine damage.
4. Define target-circle intersection for disks, sectors/arcs, rings and line capsules. Test near edges and world-to-render conversion. Moving projectiles/orbits use swept contact to avoid tunneling.
5. Explicitly define terrain occlusion per attack. For the first straight projectile, walls stop travel; the displayed path ends at the same obstacle. Ground impacts cannot secretly cross a forbidden targeting boundary.
6. Projectiles preview a corridor/path, not a promise that its entire length damages instantly. Persistent and moving effects distinguish future danger from currently damaging areas.
7. Cancellation, caster defeat and encounter reset remove pending previews and prevent stale damage. Define whether already-launched projectiles persist per move.
8. Use one app-controlled mechanical clock and bounded substeps; attack contact animation follows its phase. Ambient Idle presentation has a separate unpaused clock per the later user clarification. Rendering samples state without advancing it.
9. Bound concurrent emitters, particles, trails and sound voices. Cosmetic quality reduction may reduce decoration, never hide danger areas or change hit detection.
10. Preparing, firing and impact visuals must remain readable on the current pixel-art terrain and small Thor display, including several overlapping attacks.

## 5. Milestones and releases

Version numbers below assume the next release follows current `0.4.0`. Re-read local and remote versions before execution; if another release intervenes, continue incrementing the actual patch. Each milestone must be independently usable and green before publication. Internal schema/helper work ships with its corresponding playable or authoring milestone, not as a broken public intermediate state.

Every milestone must load/cache its own newly introduced scene dependencies on the first online visit and verify an offline reload before release. This includes Attack/Hurt in M2, additional move assets in M3, VFX/audio in M5 and the authoring entry's declared dependencies in M6. M7 is the integrated offline audit, not permission to ship broken offline behavior earlier.

### M0 — Baseline and detailed fixtures; no standalone release

- [x] Reconcile existing dirty changes with their authorized tasks; preserve all unrelated edits. Do not stash/reset or create commits merely to make the tree look clean.
- [x] Run the existing build and production browser suite; retain baseline screenshots and diagnostics.
- [x] Record current save/remapping fixtures, input action defaults and scene actor positions.
- [x] Prepare deterministic encounter fixtures for stationary hits, pursuit, terrain boundaries and multiple casters without replacing the production scene.
- [x] Record the provisional move list and unknown policies above. Add regression tests before each mechanic, not a speculative framework.

### M1 — Proportional controls and relative Pokemon speed; proposed release 0.4.1

- [x] Inspect movement source selection and reproduce partial/full stick input in desktop browser fixtures. Cover simultaneous analog and emulated digital/keyboard signals and verify published build freshness without requesting device diagnostics.
- [x] Fix only reproduced input issues; preserve keyboard-only play, custom axes/buttons, radial deadzones, release gating and normalized diagonals. Do not claim analog values can be recovered from a purely digital signal.
- [x] Add movement settings and pure relative-speed resolver; apply to roaming and future pursuit using behavior multipliers. Replace authored absolute roaming speed deliberately and update existing profiles/tests rather than multiplying two competing speed sources.
- [x] Update roaming travel timeout from resolved speed, so slower actors are not cut off prematurely. Keep idle durations, radii and shared terrain collision.
- [x] Expose raw magnitude, chosen movement source and resolved speed in diagnostics. Test several species stat ratios and half/full stick, including an idle player.
- [x] Acceptance in automated and desktop browser checks: player maximum is species-independent, partial analog input is slower, NPC speed does not depend on stick magnitude, and roaming stays coherent.

### M2 — First complete fight and honest telegraphs; proposed release 0.4.2

- [x] Add typed combat entities, teams, HP, attack requests and minimal hostile states: idle/roam, approach, prepare, active/recover, defeated. Reuse movement/collision; avoid adding a general pathfinding framework.
- [x] Transfer gameplay actor ownership out of the presentation-oriented Pokemon adapter into app/domain composition, keeping one authoritative set of positions.
- [x] Implement short frontal contact geometry, preparation, aim tracking/lock, movement lock, single-hit policy, damage, recovery/cooldown, defeat and retry.
- [x] Implement Ecras'Face/Pound for Rondoudou with a verified species move assignment and a selected compatible enemy move. Use minimal real attack/hurt animation and impact feedback immediately.
- [x] Add attack input and at least one playable equipped slot, then the second slot as its move becomes available. Migrate old binding records by filling only new actions; preserve all customized existing bindings.
- [x] Show HP, equipped move/preparation/availability and clear defeat/retry feedback. Avoid always-visible technical panels.
- [x] Acceptance: a short encounter can be started, anticipated, dodged, won, lost and retried with keyboard/touch/gamepad. No damage before preparation completes; preview and actual contact agree.

### M3 — Five official moves, action-driven time and contextual controls; release 0.4.4

- [x] Extend geometry/motion as needed for Fouet Lianes (Bulbizarre frontal reach), Pistolet a O (Carapuce narrow projectile), Berceuse (Rondoudou circular sleep) and Fatal-Foudre (Pikachu delayed ground impact).
- [x] Verify official French names, move identity and species learnability for a documented reference game/generation before authoring records. Do not invent availability for every species.
- [x] Make Berceuse immobilize its caster throughout preparation. Define sleep duration, wake-on-hit and interruption behavior explicitly and test it.
- [x] Define a small deterministic damage policy using power/category and relevant attack/defense values, with documented provisional balance. Keep PP, random accuracy, type chart and abilities catalog-only unless separately implemented and tested.
- [x] Give each move distinct editable preparation, lock interval, reach and recovery/cooldown values; document that these are real-time balance, not copied main-series timing.
- [x] Add controlled enemy attack selection based on range and availability, telegraph cleanup and target loss. Keep neutral visitors neutral and existing collection functional.
- [x] Acceptance: all five moves can be exercised in the lab, approved moves are usable by their actors, and each creates a visibly different positioning decision.

### M4 — Composable advanced patterns; proposed release 0.4.5

- [x] Add disk/cone/sector/arc/ring/line shapes only where not already implemented, with editable dimensions and placement modes.
- [x] Implement multiple/random placements, delayed waves, persistent zones, moving projectiles and orbit motion with explicit angular speed/count/radius/lifetime.
- [x] Implement once-per-cast/projectile and periodic hit rules, separate seeds, terrain policy and bounded spawn counts. Validate incompatible settings.
- [x] Use clearly labeled technical lab fixtures for combinations without an approved official move mapping. Do not publish a fabricated Pokemon move as official.
- [x] Acceptance: the requested pattern families run through the same cast pipeline; random previews match eventual positions; a low frame rate cannot skip contacts or multiply hits.

### M5 — Coherent editable attack presentation; proposed release 0.4.6

- [x] Inspect actual Pokemon sprites, terrain and camera captures before defining effect palette, pixel density, outlines and scale. Produce a small visual reference sheet and asset inventory.
- [x] Add local sprite effect loading, bounded sprite/particle emitters, trails, impact effects and optional short sounds through platform adapters. Acquire/create assets only with recorded provenance and appropriate rights; preserve named artist credits.
- [x] Create reusable water/electric/plant/normal/sound presentation presets plus move-specific overrides. Supply coherent full presentations for all five initial moves, not colored debug geometry alone.
- [x] Layer ground telegraphs under actors, actor-attached effects with depth sorting and readable impacts/trails above the relevant surface. Prevent tree occlusion from completely hiding danger.
- [x] Use Attack/Hurt animation metadata and preserve source roots/direction/timing. Coordinate visual cues with simulation preparation/impact without making source animation frame duration decide damage. Use hold/phase policies or separate effects rather than silently rewriting imported timing.
- [x] Support reduced motion and audio unlock/mute; keep mechanical cues visible and avoid repeated sound events while scrubbing/replaying.
- [x] Measure desktop browser frame timing for an authored dense effect scene and verify concurrent enemy warnings separately; keep configured rendering budgets bounded. Keep compact viewport readability covered without claiming device performance.
- [x] Acceptance: each move reads as its intended action/type at gameplay scale; impacts match contact; visuals remain stable across directions and pause/resume. Inspect live screenshots and recordings, not just unit results.

### M6 — Human-facing attack editor; proposed release 0.4.7

- [x] Add a separate authoring entry using the current TypeScript/DOM/Canvas stack. Keep its modules lazy/separate from normal play; editor state never mutates the live save or encounter.
- [x] Build move list/search, duplicate/new definition, conditional property inspector, undo/redo, dirty indicator, errors and revert-to-source controls.
- [x] Provide actual simulation/render preview with caster/target choice, directions, distance, movement, seed, terrain, HP, geometry overlays and hit markers.
- [x] Add semantic timeline, pause/play/restart, slow motion and stepping. Scrubbing backwards resets/replays the deterministic simulation and event ledger; it must not replay sounds or accumulate ghost particles/hits.
- [x] Expose geometry, preparation, tracking/lock, movement policy, active duration, recovery, cooldown, repeated-hit rules and effect parameters with units and useful bounds.
- [x] Expose visual tracks, local asset browser/replacement, animation timing, anchor/offset, color/size, particle count/speed/spread/lifetime, trail width/length and impact layers. Show inherited preset values versus overrides and which moves share a preset.
- [x] Validate all edits before applying; retain the last valid preview and show actionable field errors. Resolve changed values at cast restart rather than changing a cast's hitbox halfway through a preview unintentionally.
- [x] Import/export exact source-record bundles with stable filenames, dependencies and optional new assets. JSON is the source format; show a reviewable change summary before replacing a shared preset.
- [x] Default browser workflow: download the changed records/assets with placement instructions, then regenerate/check/rebuild the project. GitHub Pages cannot rewrite repository files. Optional direct folder saving requires explicit user folder selection, browser capability checks and a working download fallback; no exposed filesystem-write server.
- [x] Keep browser drafts separate and versioned; distinguish draft persistence from saving authored project files. Never overwrite authored records with upstream reference imports.
- [x] Acceptance: a human can duplicate an attack, change range/preparation, replace its sprite, alter a trail and impact, replay, export, integrate the records and reproduce the same result after rebuilding without editing TypeScript.

### M7 — Integrated quality and offline release; proposed release 0.4.8

- [x] Tune the full encounter and all five initial moves, telegraph overlap, preparation/recovery readability and multi-enemy pressure with real play sessions.
- [x] Validate first-visit offline loading for Attack/Hurt, VFX and any sounds before showing combat ready. Adjust `scripts/offline-assets.mts` or explicit scene dependency loading as necessary; do not eagerly download an entire future effect library.
- [x] Keep readiness honest if assets fail or the worker is unavailable. A silent fallback must not disguise a missing gameplay cue.
- [x] Validate reload, import/export, focus changes, suspension/disconnection and editor separation. CI artifact upload includes combat/editor failures.
- [x] Final live `/pmd-rt-web/` deployment and existing-session PWA update verified for 0.4.9; evidence retained under `output/quality/`.
- [x] Complete desktop browser regression coverage for input, remapping, compact layouts, multiple enemies/effects and simulated lifecycle events. Physical Thor testing is user-owned and outside this milestone.
- [x] Acceptance: no unresolved gameplay blocker in verified flows, no original save loss, no unannounced hit area and no claimed hardware verification based only on simulation.

## 6. Save and compatibility policy

- Preserve `pmd-field-save-v1` storage key, version-1 migration, valid existing version-2 saves and rejected-save protection introduced in the preceding task.
- First fight proposal: keep HP, projectiles, telegraphs, statuses and enemy runtime transient. Reload/import starts a safe fresh encounter while preserving exploration progress. Clearly document this behavior; do not silently persist only half of a fight.
- Make safe re-entry concrete: preserve the saved player position, clear pending attacks and reset enemies, start the restored encounter paused until explicit resume, then enforce an editable initial grace interval (proposed default: one second) during which enemies cannot begin attacks or deal damage. Test reload/import while touching a hostile and midway through preparation; do not silently relocate the player or resume an old projectile.
- If persistent HP/equipment becomes required, introduce an explicit new embedded version with tested v1/v2 migrations, validation and rejection of unknown future versions before release. Do not append unvalidated fields to the existing save format.
- Never reorder old collectibles, reset bindings or repurpose confirmation/back actions. New combat bindings need explicit upgrade/validation tests, including partial or malformed stored data.
- Export/import and retry cancel active casts/effects and clear held attacks. Opening a menu, resuming or reconnecting must not cause a buffered accidental attack.

## 7. Verification matrix

| Area | Required evidence |
| --- | --- |
| Data | Invalid combinations/paths/references rejected, positive preparation, generated files current, catalog-only moves still honest |
| Speeds | Equal/different stats, clamps/exponent, species-independent player maximum, partial stick, digital diagonals, independent NPC movement |
| Geometry | Target radius and boundaries, all directions, moving swept hits, terrain stopping/preview agreement |
| Casts | Exact phase boundaries, overshoot ticks, pause, cancellation, defeat, no early hit, no retarget after lock |
| Randomness | Reproducible seeds, same preview/impact placements, cosmetic RNG does not change damage |
| Hit/effects | Single/repeated contact limits, sleep/expiry/wake policy, HP bounds, defeated target/caster and team rules |
| Controls/saves | Existing remaps plus added slots, no accidental held cast, v1/v2 preservation, denied storage, rejected save remains intact |
| Presentation | Native roots/timing, directional effects, cue/impact alignment, depth/visibility, bounded particles and reduced motion |
| Editor | Undo/revert, invalid fields, deterministic replay/scrub, isolated state, dependency-aware export/import and rebuild equivalence |
| Browser/PWA | Production preview, subpath, first-visit offline combat assets, service-worker fallback/update, suspend/resume |
| Verification scope | Automated and desktop browser evidence only; physical Thor testing is independently user-owned and never requested or blocking |

Run targeted regression tests while implementing each concern. At each major milestone run `npm run content:generate` when records/schemas changed, `npm run build` (includes `check`), production preview and `npm run test:browser` plus new combat/editor suites. Use `npm run pokemon:check` for asset integrity and `npm run pokemon:qa` with visual review after changing Pokemon animation handling. Extend `window.render_game_to_text()` with cast phases, targets, resolved geometry, speed and effect counts; keep `window.advanceTime(ms)` on the real update path.

## 8. Publication protocol for every major milestone

1. Review the scoped diff, pending user changes and remote branch state. Create a recoverable commit checkpoint from the milestone's owned files; never stage the entire dirty tree indiscriminately or force-push.
2. Increment patch consistently in `package.json`, root/package entries in `package-lock.json` and `src/app/config.ts`. Preserve embedded save/schema version independence. Add a version consistency check if needed.
3. Complete the verification matrix relevant to that milestone, build production output and inspect its actual UI. Do not push a milestone with failed required checks.
4. Commit with the project's conventional, user-oriented format, push the validated milestone to `main`, and let `.github/workflows/pages.yml` build/deploy only `dist/`. Never commit generated build output.
5. Inspect the actual Actions run through successful verify and deploy, then load `https://ash2ops.github.io/pmd-rt-web/` in a fresh browser context and verify the visible build version and one relevant interaction.
6. Verify update behavior separately for an existing PWA session: the old worker may legitimately remain until all old windows close. Never force activation that silently interrupts a live encounter.
7. Report version, commit, deployed URL and completed checks. A successful push is not proof of a completed deployment.
8. If deployment fails, stop the release sequence, diagnose/fix and verify it before declaring publication or advancing to another release. Do not reset history or revert unrelated work.

Publish milestones after their automated, desktop browser and deployment checks pass. Do not wait for or request physical Thor tests; the user handles those independently. Do not invent hardware evidence or repeatedly request publication approval already granted.

## 9. Completion criteria

- [x] Relative speed and analog control behave as designed in source, automated tests and desktop browser fixtures, including competing digital input sources.
- [x] Five real moves deliver distinct, telegraphed, prepared combat behaviors with tested damage/status rules.
- [x] All requested pattern families exist as reusable validated building blocks, with technical fixtures clearly separated from official move definitions.
- [x] Sprites, particles, trails and impacts are readable, bounded, offline-capable and editable independently of gameplay rules.
- [x] The attack editor uses the actual game pipeline and completes the human edit/export/rebuild round trip.
- [x] Existing exploration, saves, custom controls and lifecycle behavior remain intact.
- [x] Every milestone has a verified patch release, including final 0.4.9 deployment and the existing-session PWA update. Physical Thor tests are not a completion requirement.

Recruitment, progression, procedural dungeons, a full type/ability system and a complete Pokemon roster are outside this plan unless separately requested.

## Integrated exploration combat (follow-up objective, 2026-10-19)

This later user request replaces the separate player-facing training encounter with one persistent field encounter. The workshop and its lab fixtures remain separate authoring tools. Starting checkpoint: `2b7d067` (`main` = `origin/main`, package 0.4.10); the already published camera/HUD commits are part of the baseline. The user authorized scoped commits and Pages publication after each stable step, with no forced push and no hardware-test gate.

| Step | Target | Scope | Delivery status |
| --- | --- | --- | --- |
| 1 | 0.4.11 | Declare hostile/neutral actor teams in content; make one persistent encounter own field actor positions; move attacks into exploration; remove the training launch path; prove neutral defaults, position identity and action-clock freeze. | Published commit `1f207a9`; local build (146 tests) and all browser suites pass; Actions run `39253660495` verify/deploy succeeded; live build and offline reload show 0.4.11. |
| 2 | 0.4.12 | Add action-triggered, proximity- and line-of-sight-aware hostile aggro, pursuit, authored move warnings/attacks, per-enemy victory and same-map K.O. recovery. | Published commit `18ee85e`; build (151 unit tests), full browser suite and `/pmd-rt-web/` combat flows pass; Actions run `39260329523` verify/deploy succeeded; live attack warning and offline reload show 0.4.12. |
| 3 | 0.4.13 | Verify save-before-recovery, transient resets, pause/suspension/blur/reload, offline update behavior; finish README, combat status and tracking notes; publish only after production browser and live PWA checks. | Published commit `9919f63`; local build (151 unit tests), full production browser suite and `/pmd-rt-web/` combat flows pass; Actions run `39264259337` and Pages deployment `7175742033` succeeded. A fresh live page runs 0.4.13 offline. An existing 0.4.12 session stayed on 0.4.12 during the immediate close/reopen check; the controlled two-version worker update suite passes locally. |

Preserve action-driven world time, separate ambient Idle animation, continuous collision, input remaps, save keys/formats and `/pmd-rt-web/` paths. The existing camera changes at `7b239b4` stay in the baseline. See the current [combat status](../../COMBAT-TODO.md); update this table and `progress.md` with observed results after each release.
