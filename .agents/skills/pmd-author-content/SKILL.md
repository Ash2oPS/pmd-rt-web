---
name: pmd-author-content
description: Add or edit PMD game content, playable moves and attack-editor bundles using the existing JSON pipeline. Use for content work, not speculative new combat architecture.
---

# PMD content authoring

Run commands from the repository root. Read only the reference needed for the change:
- [Content records](../../../docs/CONTENT.md): species, moves, settings, items or maps.
- [Attack authoring](../../../docs/ATTACK-AUTHORING.md): combat patterns, presentation or editor bundles.
- [Architecture](../../../docs/ARCHITECTURE.md): only when existing mechanics cannot express the request.

## Choose the smallest change

Inspect an existing record in the same category and its schema in `src/content/`.
Use `content/<category>/<stable-id>.json`; preserve referenced IDs.
Keep existing content edits separate from imported reference datasets under `imports/`.
For a species using existing behavior, use records and references without renderer branches.
Before assigning an official move, verify its compatibility in the pinned PokeAPI learnset.
If the pinned dataset lacks evidence, report that gap rather than inventing compatibility.
Keep technical demonstrations under `content/lab-fixtures/lab-*.json`, outside the official catalog.
Keep designer variants' `sourceMoveId`; never silently present them as canonical definitions.

## Moves and presentation

Reuse existing patterns and effects. A new effect needs explicit domain behavior before a playable claim.
Preparation, tracking, range and damage belong to combat records; sprites and particles belong to presentation.
Prefer move-specific `visualOverrides`; inspect consumers before editing a shared preset.
Use a private visual or asset for a change intended to affect one move only.
Preserve source credits for imported images; use the asset-import skill for Pokemon source changes.

For a downloaded editor bundle, inspect its proposed writes first:
```sh
npm run attack:apply -- path/to/attack-bundle.json
npm run attack:apply -- path/to/attack-bundle.json --apply
```
The second command writes project files; run it only within the authorized content change.
The importer validates confined paths and keeps replacement backups in `output/authoring-backups/`.

## Verify the result

Run `npm run content:generate` after record/schema edits, then `npm run check` for data-only changes.
For playable or visible behavior, run `npm run build` instead (it includes check), serve `npm run preview`, and exercise the affected production browser flow.
Use the lab's compatible caster, fixed seed and phase markers to compare geometry, warnings and actual contact.
Run the full production browser suite before a runtime release; avoid duplicate successful checks without a new reason.
Stage generated manifests/schemas with their source records; never edit generated outputs directly.
Report changed records, verified behavior and any catalog-only limitations in a few lines.
