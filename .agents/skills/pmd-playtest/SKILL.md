---
name: pmd-playtest
description: Reproduce PMD gameplay or UI behavior with existing deterministic production-browser scenarios and inspect screenshots and state.
---

# Playtest the PMD web game

Use a built production preview, not `npm run dev`. Read only the scenario owner and relevant regression when reproducing a bug; do not load every browser test into context.

```sh
npm run build
npm run preview
# In another terminal, from the repository root:
node .agents/skills/pmd-playtest/scripts/playtest.mjs --suites combat,hud --url http://localhost:5173/
node .agents/skills/pmd-playtest/scripts/playtest.mjs --suites combat,hud --url http://localhost:5173/ --run
```

The first helper command prints a plan. The second runs it. Omit `--suites` or use `all` to run the authoritative `npm run test:browser`, including suites added later. `--url` retains hosting subpaths. The bundled helper reuses `../pmd-verify-change/scripts/checks.mjs`; keep both project-local skills together.

## Choose the smallest useful scenario

| Suite | Existing evidence |
| --- | --- |
| `browser` | Exploration, saves/import, remaps, lifecycle, touch menus |
| `pokemon` | Scene sprites, Idle/Walk and first-visit offline sheets |
| `realtime` | Analog magnitude, diagonals, collision, blur and NPC motion |
| `combat` | Preparation/lock, damage/status, projectiles, action clock, retry |
| `lab` | Advanced patterns, seeded placements and deterministic scrubbing |
| `effects` | Visual presentations, budgets, missing assets and offline effects |
| `editor` | Invalid drafts, undo, images, export/import and separate save storage |
| `pwa-update` | Real worker template with an HTTP-cached two-version fixture |
| `hud` | Portrait, viewports, cast/cooldown labels, controller/remaps and offline icons |

## Reproduce, inspect, correct

- Existing scenario files are `tests/<suite>-browser.mjs`, except `browser` is `tests/browser.mjs`. Reuse their scene fixtures and readiness helpers when adding a regression; do not create another harness for the same flow.
- Drive short inputs and pause between observations. Read `window.render_game_to_text()` and advance via `window.advanceTime(ms)`; the lab uses `render_attack_lab_to_text()` / `advance_attack_lab(ms)`.
- When disabling automatic RAF, wait for resize completion, then draw with `advanceTime(0)` before capturing. A canvas resize clears its pixels; a black screenshot is not evidence of a valid screen.
- Inspect actual screenshots, state transitions and browser errors. A passing assertion alone is insufficient for a visual claim. Compare relevant cast/contact phases, not only the initial screen.
- Reproduce the failing case, make the smallest correction, rerun that case and broaden only for affected shared behavior. Run all suites before a runtime release.

Complete logs and compact results are in `output/ai/<run>/`; captures remain in each suite's `output/` directory. The helper does not start or stop servers. Stop only processes you own. Existing scenarios can write their dedicated browser-context saves and capture files, never the user's normal browser profile. Desktop simulation does not establish Thor hardware behavior; never request device testing.
