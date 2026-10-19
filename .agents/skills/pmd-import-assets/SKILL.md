---
name: pmd-import-assets
description: Import or change PMD Pokemon sprites and portraits through the pinned SpriteCollab pipeline, preserving geometry, attribution and offline loading. Use for source assets, not generated attack artwork.
---

# PMD Pokemon asset imports

Read [the asset contract](../../../docs/ASSETS.md) before changing import selections or sources.
Run commands from the repository root. Inspect only the requested species in:
- `imports/pokemon/config.json`: selected species, source pin and portrait folder.
- `imports/pokemon/sources.lock.json`: source URLs and byte hashes.
- `imports/reports/pokemon-coverage.json`: available animations and attribution.

## Select sources deliberately

Reuse committed, verified snapshots unless the request requires a source update.
A new species needs an explicit stable ID and dex number in the configuration.
Change the pinned commit or selected snapshot deliberately; never delete the lock to bypass an integrity error.
`portraitFolder` is independent of the sprite selection and species identity.
For Rondoudou/Jigglypuff, the Alternate portrait is `0039/0001`; do not switch its battle sprite to match.
Keep portrait PNGs and credit histories byte-identical to the selected upstream files.
Do not transform cached source images or normalize whitespace/line endings in protected import paths.
Use authored `content/` records for game balance; importing reference data must not overwrite them.

## Import and inspect

Run the existing pipeline rather than copying generated sheets or manifests manually:
```sh
npm run pokemon:import
npm run pokemon:check
npm run pokemon:qa
```
`pokemon:import` uses the configured selection; `pokemon:check` reproduces it offline from committed sources.
Inspect the relevant native-pixel contact sheets and report in `output/pokemon-qa/`.
Preserve centered world roots, source frame timings, eight direction rows and intentional pose displacement.
White markers locate shadows; they must never become normalized sprite roots.
Inspect the generated coverage and `public/credits/pokemon.json` for named sprite and portrait contributors.
Retain upstream license and rights files; a generic repository credit does not replace artist attribution.

## Validate integration

Review changes in config, lock, cached sources, generated manifests, images and credits as one import.
Confirm every new runtime URL resolves against the deployed `/pmd-rt-web/` base.
Build production output and exercise the relevant Pokemon/HUD browser flow against `npm run preview`.
Verify first completed online loading followed by offline reload for the affected scene assets.
Do not call all species offline-ready merely because the initial scene is cached.
If the importer rejects geometry, timing or hashes, correct the cause; do not patch generated output.
Report selected source/variant, attribution and visible/offline verification briefly.
