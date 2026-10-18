# Pokemon source pipeline

## Reproduce and verify

- `npm run pokemon:import` imports the ten explicit base species in `imports/pokemon/config.json`.
- `npm run pokemon:check` performs the same conversion using committed sources, without network access, and compares every generated output byte for byte.
- The equivalent commands are `node --import tsx scripts/import-pokemon/main.mts` and the same command with `--check`.
- `npm run pokemon:qa` audits every imported frame against its source geometry and writes native-pixel contact sheets plus a report under `output/pokemon-qa/`. Inspect the contact sheets after changing sources or animation sampling.
- SpriteCollab files are pinned to the full commit in the configuration. Every downloaded file, including PokéAPI responses, has a URL and SHA-256 in `imports/pokemon/sources.lock.json`. Existing snapshots are verified and reused rather than silently refreshed.

To update a source, deliberately change its pin (SpriteCollab) or replace its selected PokéAPI snapshot and lock entry, then import and review the resulting diff. Never delete the complete lock just to bypass an integrity failure. New species require an explicit stable ID and dex number in the configuration. Base forms only are selected in this first batch; future forms need explicit source folders and identifiers.

`.gitattributes` preserves exact bytes under `imports/`, `public/pokemon/` and `public/credits/` on every platform. Do not normalize upstream whitespace or line endings: this breaks source hashes and reproducibility.

## Data and author edits

`imports/raw/` contains unchanged upstream snapshots. `imports/pokemon/species.json` is the generated normalized PokéAPI reference dataset: French names, canonical stats, types, ability references, versioned learnsets, growth and evolution references. These are main-series reference values, not implemented PMD mechanics. Authored game balance and learnsets remain in `content/`; the import does not overwrite them.

Do not edit generated datasets or manifests by hand. Game-specific overrides belong to the authored `content/` records, so updating source snapshots cannot overwrite them. The first import intentionally acquires only the Normal portrait per species; additional emotions can be selected in a later extension.

## Animation contract

`public/pokemon/manifest.json` lists locally hosted PNG sheets and metadata. Paths are relative to the public root and consumers must resolve them against Vite's base URL. No runtime request goes to PokéAPI or GitHub.

Production image loading waits for service-worker control on the first visit so lazy scene assets enter the runtime cache immediately. If workers are unsupported, local development starts immediately; if worker activation fails, an eight-second maximum wait allows normal online loading to continue. This makes the initial scene available after an offline reload without requiring an extra online reload first. Other species/animations become available offline after they have been loaded.

Each animation preserves the original frame dimensions and source timings. `sourceDurations` uses 60 Hz ticks; `durations` uses milliseconds. The frame column is the animation frame; sheet rows are down, down-right, right, up-right, up, up-left, left, down-left. Only one-row or eight-row sheets are accepted. `origin` is the centered sprite root. `origins[direction][frame]` stores the original white shadow marker within the frame; it describes the shadow position, not a replacement sprite root. Exactly one marker is required in every frame; missing or duplicate markers fail the import rather than guessing an anchor. Flying/hopping poses retain their displacement inside the centered source frames. `shadowMask` preserves the selected authored mask geometry as black RGBA: ShadowSize 0 uses green (small), 1 red (normal), 2 blue (large); the component multiplied by source alpha becomes output alpha. The renderer applies its shadow opacity without reshaping the mask. Original Offsets/Shadow PNGs and complete AnimData XML are shipped unchanged for future attachment/attack logic. Rush/hit/return frame markers are preserved. CopyOf chains resolve to the actual source sheet, and cycles, malformed XML, invalid timing and inconsistent sheet dimensions fail the import.

The selected animations are Idle, Walk, Attack and Hurt. Importing Attack/Hurt does not implement combat. `imports/reports/pokemon-coverage.json` reports availability and attribution; this initial batch is complete for those four animations.

## Attribution

Sprite source: [SpriteCollab](https://github.com/PMDCollab/SpriteCollab). Reference format: [PMD sprite format](https://wiki.pmdo.pmdcollab.org/PMD_Sprite_Format). Data source: [PokéAPI](https://pokeapi.co/docs/v2).

The original PNG pixels are unmodified. Community submissions are distributed under SpriteCollab's CC BY-NC 4.0 policy: non-commercial use and appropriate attribution. Original official assets retain their respective rights; repository licensing is not a blanket grant of Pokemon franchise rights. Preserve the copied license, source readme and per-species sprite/portrait credit histories. `public/credits/pokemon.json` resolves contributor identifiers from the pinned credit directory and records sources, original rights and metadata conversion. Display these credits from the game's journal. Never replace named artists with a generic SpriteCollab credit.
