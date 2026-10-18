# Workspace guidance

- Keep responses concise and factual. Ask only for required missing information.
- Read this file before changes. Keep all guidance files in English.
- Never modify `C:\Users\etiennes\Desktop\MonsterPlayable\monsterplayable-engine` or `C:\Users\etiennes\Desktop\MonsterPlayable\monsterplayable-package`.
- Keep changes scoped. Use useful subagents. Create a clean checkpoint before large changes when possible.
- Show functional screenshots when possible. Use PySide for any Python UI.

# Project

- Static browser game, deployed to GitHub Pages from `main` at the repository root.
- No runtime dependencies or build step. All asset URLs must be relative for `/pmd-rt-web/` hosting.
- `npm run dev` serves on port 5173. `npm test` verifies game rules; `npm run test:browser` verifies browser flows.
- Preserve keyboard, touch and gamepad parity, remapping, safe local saves, explicit resume after suspension, and offline PWA support.
- Bump the cache version in `sw.js` whenever shipped runtime files change.
- Keep `window.render_game_to_text()` and `window.advanceTime(ms)` available for automated checks.
- Device input mapping and real Android sleep/install behavior require a physical AYN Thor test; never claim these were verified by desktop simulation.
- Default face controls follow Thor labels: east A (button 1) confirms; south B (button 0) returns. Preserve custom remaps.
- Use the copied input diagnostic for hardware issues. Native Android joystick scrolling may occur without DOM wheel events; a zero wheel count does not exclude it.
