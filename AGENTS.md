# Workspace guidance

- Keep responses concise and factual. Ask only for required missing information.
- Read this file before changes. Keep all guidance files in English.
- Never modify `C:\Users\etiennes\Desktop\MonsterPlayable\monsterplayable-engine` or `C:\Users\etiennes\Desktop\MonsterPlayable\monsterplayable-package`.
- Keep changes scoped. Use useful subagents. Create a clean checkpoint before large changes when possible.
- Show functional screenshots when possible. Use PySide for any Python UI.

# Project

- Strict TypeScript browser game. `npm run dev` serves on port 5173 with Vite; `npm run build` creates verified production output in `dist/`.
- GitHub Pages must publish the built artifact through `.github/workflows/pages.yml` using the GitHub Actions publishing source. Never deploy raw repository-root TypeScript.
- All asset URLs must support `/pmd-rt-web/` hosting. Production is offline-capable; local development retires stale workers.
- Run `npm run check` for content, types, architecture and unit tests. Run browser flows against `npm run preview` after a build, not the development server, to verify offline behavior.
- Preserve keyboard, touch and gamepad parity, remapping, safe local saves, explicit resume after suspension, and offline PWA support.
- Offline caches are generated from emitted file hashes by `scripts/build-offline.mts`; do not edit a generated worker/cache manifest manually.
- Keep `window.render_game_to_text()` and `window.advanceTime(ms)` available for automated checks.
- Device input mapping and real Android sleep/install behavior require a physical AYN Thor test; never claim these were verified by desktop simulation.
- Physical Thor testing is owned independently by the user. Do not request device tests/diagnostics or gate completion and publication on them.
- Default face controls follow Thor labels: east A (button 1) confirms; south B (button 0) returns. Preserve custom remaps.
- Use the copied input diagnostic for hardware issues. Native Android joystick scrolling may occur without DOM wheel events; a zero wheel count does not exclude it.
- The canvas fills the viewport with a uniform camera following the explorer. Keep expedition details in the pause menu's journal panel.
- Window blur clears held input and saves without pausing. Page hiding/freezing and controller disconnection still pause; do not restore blur-triggered pauses.

# Architecture and AI contribution rules

- Read `docs/ARCHITECTURE.md` and `docs/CONTRIBUTING.md` before changing subsystem boundaries. Follow `docs/CONTENT.md` for content changes.
- One focused responsibility per module. A warning starts at 300 TypeScript lines and checks fail above 350. Do not raise limits or split arbitrarily to hide a monolith.
- Keep content in `content/<category>/<stable-id>.json`; use existing records and generated editor schemas. Adding a species that reuses existing mechanics must not require renderer or platform edits.
- Run `npm run content:generate` after content/schema edits, then `npm run check`. Commit generated manifests/schemas with their source records; never edit them manually.
- `src/content` owns schemas/validation/catalog; `src/domain` owns pure rules; `src/platform` owns browser adapters; `src/rendering` owns drawing; `src/ui` owns presentation; `src/app` composes them.
- No browser globals in domain/content, forbidden import directions, circular dependencies, explicit `any`, checking suppression directives, executable content strings or duplicated mechanics. Architecture checks enforce common violations.
- Add behavioral regression tests for mechanics, save changes and bug fixes. Preserve legacy save keys and formats; introduce explicit tested migrations before changing them.
- Keep starter catalog descriptions honest: species/moves/abilities are example definitions. Do not describe unimplemented combat or effects as playable.
- Do not add speculative combat engines, ECS frameworks or plugin systems before a concrete mechanic requires them.
- Follow `docs/ASSETS.md` for Pokémon imports. Keep source pins, hashes and named artist credits; never overwrite authored content with imported reference data.
- Sprite sheet centers are world roots. White markers locate shadows, not sprite roots. Preserve source frame timing, direction rows, intentional motion and selected shadow masks; do not normalize each pose to its visible bounds.
- Run `npm run pokemon:check` after asset changes. Only load scene assets at runtime; preserve first-visit offline caching before declaring sprites ready.
- Player and roaming actors move in continuous tile-center coordinates through shared swept circle collision. Preserve analog magnitude, radial deadzones, custom remaps and normalized digital diagonals; do not reintroduce tile-step input or interpolation lag.
- Saves use embedded version 2 under the original storage key, with an explicit tested version-1 migration. Pause/suspension freeze movement, AI and animation clocks. Blur clears held movement and requires stick release without pausing.
- The action-driven world clock runs only for player movement intent, held Wait or the player's own preparation/active/recovery. Idle and aim-only freeze all world systems; enemy activity alone never advances time. Four face buttons launch equipped moves in play; menus retain east A confirm/south B back. L aims in place and R waits by default, with keyboard/touch equivalents and remaps.
- Ambient/Idle Pokemon animation stays alive at rest on a separate unpaused presentation clock. Idle does not advance positions, attack phases, projectiles, statuses or cooldowns. Real menu/suspension pauses freeze both clocks; attack contact animation remains synchronized to its mechanical phase.
