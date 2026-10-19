Original prompt: Set up the proposed first milestone immediately: a playable scene on AYN Thor with movement, controller menus, saving and resume after sleep.

## Scope and design
- User approved the proposed milestone and requested immediate implementation.
- Static ES modules with Canvas 2D; no build required. GitHub Pages root hosting and PWA cache.
- Forest exploration room, warm pixel-art palette, yellow original explorer, a few collectibles; game is the primary surface.
- Movement feedback, subtle water/firefly motion and menu transitions. Respect reduced motion.
- Keyboard, touch, standard gamepad plus persistent remapping and live device diagnostics.
- Unit tests for collision, save validation, input decoding; browser tests for controls, suspend and offline.

## Implementation
- Added static forest scene, collectible objective and original locally drawn pixel art.
- Added keyboard/touch/gamepad controls, live signals, persistent remapping, menu navigation and fullscreen.
- Local auto-save, validated import/export and explicit pause on suspension/disconnection.
- PWA manifest with PNG icons, scoped offline cache and relative URLs for GitHub Pages.
- Core test-first run failed before core.js existed, then all four rule tests passed.
- Skill browser client ran successfully; reviewed scene screenshot and text state with no console errors.
- Browser suite caught a real quick-touch bug (tap edges fell between animation frames); fixed with immediate pointerdown handling.
- GitHub API confirms public repository and admin/push permission. Pages not initially enabled.

## Verification
- Four core tests and 12 browser checks pass, no browser console/page errors.
- Browser coverage: keyboard collision/pause/resume, local saves, visibility suspension, JSON import/export and invalid import, offline reload, simulated gamepad input/deadzone/remapping/disconnect, touch, storage denial and export fallback.
- Inspected desktop 1440x900, Thor-like 960x540, portrait 390x844 and compact landscape 640x360 screenshots. Entire playfield is visible, no horizontal overflow.
- Independent browser-test agent reviewed production code; no blocking findings.
- Published initial commit to `origin/main`; enabled GitHub Pages from branch `main`, root `/`.
- GitHub Pages build returned `built`; HTTPS endpoint returns 200 with the expected title.
- Reran all 12 browser checks against `https://ash2ops.github.io/pmd-rt-web/`: all pass, including service-worker offline reload under the project subpath.

## Pending
- Physical Thor: verify built-in gamepad, PWA installation and actual sleep/resume.

## Thor feedback — 0.1.1
- User confirms remaining features work, but A/B are reversed; left stick scrolls only (no player movement); L1/R1 do not light the input meter. Device ID: `Odin Controller (Vendor 2020 Product 0111)`.
- Confirmed saves are intentionally automatic. X/Y and shoulders have no gameplay actions yet; lack of raw detection is the reported issue.
- Added failing unit regression for east A/south B, then swapped default confirm/back indices. Existing custom mappings remain intact.
- Browser regression confirms menu navigation with the corrected physical face-button convention.
- Desktop reproduction with synthetic axes moves the explorer without scrolling; not evidence of correct real Android handling.
- Chromium sources confirm native joystick scrolling is a fallback when Gamepad handling declines input. Existing disconnect listener and polling already activate Gamepad updates; no evidence for adding arbitrary listeners or suppressing scroll globally.
- Added failing browser diagnostics tests, then exposed all device axes/button counts, seen buttons, axis ranges, last key/wheel events and previously hidden API errors; copy report through menu/sidebar.
- Raw data from the real Thor is needed before changing stick or shoulder decoding. Do not claim these fixed by the A/B patch.
- Validation: 5 core tests and 15 browser checks pass; clipboard export verified from both sidebar and menu. Reviewed updated screenshots and independent diagnostic review found no blocking issues.
- Important: Android native joystick fling can bypass DOM wheel events; a zero wheel count is not evidence against the reported scrolling.

## Local full-page play surface — 0.1.2
- User requests no pause when clicking outside the game and canvas filling the entire page, while viewing localhost.
- Added failing browser regression for blur behavior and viewport canvas geometry before implementation.
- Window blur now clears held input and saves without changing mode; real hidden/frozen pages and disconnections still pause.
- Stage fills the viewport, rendering with a uniform camera clamped to the world and following the explorer; no distortion or page scroll.
- Moved expedition journal/device controls into **Menu → Carnet et connexion**. Preserved existing saves/remaps.
- Bumped offline cache to v4 and displayed build to 0.1.2. User subsequently requested publication to GitHub Pages.
- Full browser suite passes 18 checks, including outside-click behavior, cleared held inputs, full viewport/camera geometry at four sizes and accessible journal. Screenshots inspected.
- Final visual pass found seams from drawing tiles directly with a fractional scale; rendering the scene to a fixed pixel buffer before nearest-neighbor scaling removes them.

## Content-driven architecture — 0.2.0
- User authorized the proposed architecture, editable content and AI contribution guardrails.
- Replaced root `game.js`/`core.js` with 28 strict TypeScript modules across content/domain/platform/rendering/ui/app. Largest handwritten module is 277 lines.
- Migrated active styles into four focused stylesheets; 20 screenshot comparisons confirmed equivalent layouts during extraction.
- Added 19 editable JSON records (5 species, 6 moves, 5 abilities, 2 items, 1 dungeon), Zod validation, cross-reference/map/reachability checks, generated manifest and editor schemas.
- Actual map/spawn/collectibles now come from the validated content catalog. Starter species/moves/abilities remain catalog-only examples; combat is not implemented.
- Architecture checker enforces layer directions, cycles, 350-line limit with 300-line warning, explicit-any and checking-suppression bans. Regression tests exercise guard failures.
- Added Vite development/build, local stale-worker retirement, hashed production precache and a verification/deployment workflow. Pages must switch from legacy root publication to GitHub Actions when publishing this migration.
- Independent review caught storage getter exceptions outside a try block; added a failing regression, moved resolution inside the guarded initialization, then verified recovery.
- Production browser tests caught Vite preview Vary-Origin cache mismatch; same-origin emitted static assets now match cached responses with ignoreVary.
- Final verification: `npm run build` passes content/strict types/architecture/26 tests and emits the offline build. All 18 browser checks pass against production preview at `/pmd-rt-web/`, including offline reload. Latest screenshots inspected.
- Built demo and source dev server verified; active local browser shows build 0.2.0 in Mode local and preserved the user's existing position/progress.
- Not published to GitHub Pages in this task. Local source server is port 5173; temporary production previews run on 5174/5175 for checks.

## Local Pokemon content and animation pipeline — 0.3.0
- User authorized importing source data/art, requested Clefairy, Jigglypuff, both Nidoran and Beedrill alongside the existing five. Use Jigglypuff as player, place other nine in the existing forest; no separate test scene and no combat.
- Imported pinned SpriteCollab source files and hash-locked PokeAPI snapshots, normalized reference data and per-artist credits. Authored content remains separate and editable. Only four selected animations (Idle, Walk, Attack, Hurt) and Normal portraits are acquired in this batch; Attack/Hurt are available assets, not playable combat.
- Implemented shared data-driven animation sampling, lazy local image loading, player Idle/Walk and nine independently phased Idle actors. Preserved legacy saves, controls and full-viewport camera.
- Critical fidelity correction: sprite world root is source tile center. Source white pixel is the shadow offset, not an art root. Never translate each pose to that marker or visible bounds. Original pixel displacement, 60 Hz source timing, compass rows, CopyOf sheets and selected shadow channel geometry are preserved.
- Audited all 1,896 directional frames across 40 animation entries: no empty frames or missing/duplicate white markers; source crops, timing samples and marker metadata agree. Inspected ten contact sheets and compact first/middle/last comparison. This validates selected imported assets, not every upstream animation or future combat playback.
- First-visit lazy asset fetches wait for worker control with a bounded fallback, ensuring immediate offline reload keeps scene art. Blocked workers cannot hang startup indefinitely.
- Verification: production build, content/source integrity, architecture, strict types and 44 unit tests pass. Existing 18 browser flows plus five new Pokemon flows pass against production preview at /pmd-rt-web/. Skill Playwright client rerun and gameplay screenshot inspected; no new console errors.
- Added source/animation guidance to AGENTS.md and docs/ASSETS.md, reproducible npm run pokemon:qa, and Pokemon browser checks to CI. Screenshots/report in ignored output/pokemon, output/pokemon-final and output/pokemon-qa.
- Local dev remains port 5173. Production preview is port 5175. Not published in this task. Physical Thor rendering/input/sleep still require on-device confirmation; desktop checks do not establish device behavior.

## Continuous real-time movement and roaming — 0.4.0
- User requested free real-time movement with polished analog sticks, light NPC Idle/Roaming behavior, then publication to Pages.
- Replaced tile-repeat locomotion with continuous analog movement, proportional speed, radial deadzones, normalized keyboard/touch diagonals, swept circular terrain collision and precise sliding. Face/menu remaps remain intact; fully remapped axis pairs retain their angle. Blur stops held controls and requires stick release without pausing the world.
- Added persistent deadzone presets (10/18/25/35 percent) under Menu > Controls. Touch supports holds and short taps. Saves occur during movement at bounded frequency, on stopping, and through existing lifecycle actions.
- Embedded save format is now version 2, retaining the original browser key. Explicit tested version-1 migration preserves coordinates, collected items, facing and steps; version 2 stores fractional positions and actual traveled distance. Both versions preserve collectible ordering.
- Nine NPCs alternate seeded independent Idle/Roaming states using JSON speed/radius/rest profiles. Clear paths and shared collision keep them on nearby floor without teleporting. No combat or creature-to-creature collision was introduced. Pause/suspension freezes the simulation and animation clocks.
- Runtime animation selects eight-direction Idle/Walk from actual movement; terrain and creature pixel roots stay unchanged. Rendering sorts Pokemon and player by vertical position within each terrain row.
- Production build passes strict types, architecture, source/content checks and 60 unit tests, including long NPC simulations. The skill Playwright client was rerun with two input bursts; final gameplay screenshots inspected under output/realtime-final.
- All 28 browser checks pass against production preview: 18 existing flows, five Pokemon/offline checks and five real-time movement/AI checks. Repeated menu checks with deliberate input holds also pass. Publication is authorized; verify the GitHub Actions result and live build after pushing. Physical Thor stick feel remains a device check, not established by desktop automation.

## Smooth camera zoom — 2026-10-19
- Request: add smooth action focus and slightly closer default framing.
- Added a bounded presentation-only zoom controller: 1.25 exploration, 1.42 during player casts, exponential 0.18-second response. App supplies unpaused presentation time; idle return does not run gameplay. Reduced motion keeps a stable exploration framing.
- Camera diagnostics expose current/target zoom; added unit and production-browser regressions for smoothing, pause, return and reduced motion.
- Validation complete: npm run build passed (144 unit tests); production browser camera/combat regressions passed; skill Playwright captures and diagnostic state inspected in output/camera-verified and output/combat/camera-action.png. Full production browser suite passed, including offline reload, responsive layouts, input, editor and PWA update fixture. Existing/concurrent asset and HUD edits were preserved.

## 2026-10-19 unified HUD
- Implement the approved generated HUD as responsive native DOM/CSS: persistent portrait/HP, quiet location/menu, four face-button slots, compact aim/wait hints and real cast/cooldown status. Preserve existing mechanics and all input/save/offline behavior.
- User specifically selected SpriteCollab Jigglypuff Alternate portrait; import pin, exact pixels and named attribution preserved.
- Validation: isolated staged-source build passed 140 tests and every production-browser suite, including five HUD viewports, touch targeting, controller/remap labels, cast/recovery/cooldown, portrait and first-visit offline icons. Concurrent camera changes excluded from this release.

## Persistent field encounter — 0.4.11 release candidate
- Declared actor teams in dungeon content: Bulbizarre is explicitly hostile and omitted teams default to neutral. Generated editor schema and content manifest are regenerated through the content pipeline.
- Replaced the separate field-roamer list with the persistent Encounter as the single NPC position owner. Equipped attacks now operate on the exploration map, victory leaves exploration active, and the pause menu keeps only the separate ability workshop.
- Preserved neutral roaming, action-driven world time, ambient Idle animations and remapped controls. A remapped direction wins over an attack using the same physical button.
- Local validation: `npm run build` passed 146 unit tests; the full production browser suite passed on `npm run preview` (19 browser, 5 Pokemon, 6 realtime, 5 field combat, 7 lab, 5 effects, 7 editor, PWA update and HUD flows). Inspected field hit, post-victory and controller telegraph captures; no console errors.
- Release version is 0.4.11. Commit and Pages publication checks are pending.
