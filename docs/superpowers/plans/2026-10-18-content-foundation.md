# Content Foundation Implementation Plan

> **For agentic workers:** Execute scoped tasks with independent file ownership and review the integrated result before completion.

**Goal:** Migrate the demo to a typed, validated, modular foundation while keeping its existing behavior.
**Architecture:** JSON catalog feeds pure domain rules. Browser adapters, UI and renderer are composed by a small application bootstrap.
**Tech stack:** TypeScript, Vite, Zod, Node test runner/tsx, Playwright.
**Spec:** `docs/superpowers/specs/2026-10-18-content-foundation-design.md`

## Global constraints
- Preserve existing save format/storage keys and remappings.
- Keep source modules below 350 lines; no checking bypasses or explicit any.
- Keep content references stable, validate both structure and references.
- Preserve full-page rendering, blur without pause, actual suspension pause and offline production play.

## Review focus
- Legacy saves remain importable after moving data and modules.
- Project-subpath assets and service worker work in built output.
- Invalid content fails before a broken build can ship.
- A new species can reuse existing mechanics without renderer changes.
- Local development does not continue serving an old cached bundle.

## Tasks
- [x] Add validated content catalog, editor schemas, starter records and content regression tests.
- [x] Extract typed rendering modules without changing art/camera behavior.
- [x] Extract typed browser input/diagnostics adapters with tests.
- [x] Implement domain state/save boundaries and migrate app/UI composition.
- [x] Add strict toolchain, dependency/size/cycle checks and meaningful guardrail tests.
- [x] Build offline assets from emitted files; configure verified GitHub Pages workflow.
- [x] Document human content workflows and AI contribution rules.
- [x] Run unit/architecture/type/content/build/browser checks, inspect screenshots and open local migrated demo.
