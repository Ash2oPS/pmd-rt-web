---
name: pmd-verify-change
description: Select and run verification for scoped PMD web-game changes, returning compact evidence before handoff or release.
---

# Verify a PMD change

Read the repository `AGENTS.md` and the affected owner's code/tests. Use [architecture](../../../docs/ARCHITECTURE.md) only for changed boundaries. Preserve unrelated work; the dirty checkout is not necessarily one task.

## Select before running

Run from the repository root:

```sh
node .agents/skills/pmd-verify-change/scripts/verify.mjs --files src/domain/combat/damage.ts
node .agents/skills/pmd-verify-change/scripts/verify.mjs --files src/domain/combat/damage.ts --url http://localhost:5173/ --run
```

Without `--files`, selection uses staged, unstaged and untracked paths. Paths are comma-separated. The default only prints a JSON plan; `--run` executes it. Use an explicit task-owned file list when other work is present.

- Iteration runs `npm run check` plus selected existing browser suites. Selection is advisory: widen it for cross-layer effects, new invariants or failures the map cannot know.
- Browser checks require built production output served by `npm run preview`, including the actual subpath when relevant. The helper rejects recognizable Vite development HTML; it cannot prove build freshness. Build after runtime changes before trusting browser results.
- `--release` always selects `npm run build` and every browser suite. Keep the preview server available for the browser stage. If starting from no build, build once, start preview, then use the playtest skill's full suite rather than rebuilding twice.
- Docs/skills-only or empty diffs return no runtime checks. This is **not** a gameplay pass. For these skill helpers, run `node --test .agents/skills/pmd-verify-change/scripts/checks.test.mjs`; validate changed skill metadata with the available skill validator.
- Content/schema changes require `npm run content:generate` before verification; the helper does not silently rewrite sources.

## Read evidence efficiently

The helper saves complete logs and `report.json` under `output/ai/<run>/`, prints compact JSON, stops at the first failed step and exits nonzero on failure. Read only that step's failure tail, then its log if needed. Successful process exit does not replace visual inspection or prove the requested mechanic.

Inspect actual screenshots and `render_game_to_text()`/`advanceTime(ms)` evidence for affected runtime behavior. Do not rerun an unchanged green suite without a new failure or uncovered risk. Shared support code lives in `scripts/checks.mjs`; the playtest skill reuses it rather than duplicating execution logic.

Report what changed, checks actually run, remaining limits and paths to useful evidence. This skill performs no commit, push or deployment and never requests physical Thor testing.
