# Content-driven game foundation

## Goal
Turn the validated browser demo into a maintainable foundation for a larger, AI-developed game. Humans must be able to add species, moves, abilities, items and dungeons as readable content without editing rendering or platform code.

## Decisions
- TypeScript with strict checking; Vite for local development and production output.
- JSON content with stable IDs, Zod schemas, generated JSON Schemas for editor assistance, and cross-reference validation.
- Layers: `content` (definitions/catalog), `domain` (pure rules/state), `platform` (browser adapters and input), `rendering` (canvas drawing), `ui` (DOM/menu), `app` (composition and loop).
- Dependency direction: app composes all layers; UI/rendering/platform may consume domain/content types; domain never imports browser adapters or presentation; content never imports higher layers.
- Source modules have a hard 350-line limit and a warning at 300 lines. No explicit `any`, TypeScript checking bypasses, source import cycles or legacy monolithic entry points.
- Preserve gameplay, saves at `pmd-field-save-v1`, custom mappings, full viewport camera, focus-loss behavior, gamepad diagnostics and test hooks.
- Keep content extensible without implementing future combat/recruitment systems prematurely. Seed records are documented examples, not a claim of canonical balance or implemented move effects.
- Built output supports GitHub Pages project paths, offline caching and localhost development without stale offline caches.

## Acceptance
- Existing browser flows pass against the migrated demo and the built project subpath.
- Content tests reject duplicate IDs, missing references, malformed records and invalid map/spawn data with useful paths.
- A human can add a species/move/item by following a concrete English guide and example records.
- Architecture checks reject prohibited dependencies, cycles, overlarge modules and type bypasses.
- CI runs the same validation, typecheck, architecture, unit, browser and build checks as local development. Deployment publishes only verified built output.
