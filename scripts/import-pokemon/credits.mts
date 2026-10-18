interface CreditSpecies { id: string; credits: string[] }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

export function creditsHtml(species: CreditSpecies[], commit: string) {
  const entries = species.map((item) => `<section><h2>${escapeHtml(item.id)}</h2><ul>${item.credits.map((credit) => `<li>${escapeHtml(credit)}</li>`).join('')}</ul><p><a href="../pokemon/${encodeURIComponent(item.id)}/sprite-credits.txt">Sprite credit history</a> · <a href="../pokemon/${encodeURIComponent(item.id)}/portrait-credits.txt">Portrait credit history</a></p></section>`).join('\n');
  return `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Pokemon asset credits</title>
<style>body{max-width:60rem;margin:2rem auto;padding:0 1rem;background:#111b22;color:#eef3ef;font:16px/1.6 system-ui}a{color:#a8e6d1}h1,h2{line-height:1.2}section{margin:2rem 0}</style>
<main><h1>Pokemon asset credits</h1>
<p>Art distributed through <a href="https://github.com/PMDCollab/SpriteCollab/tree/${escapeHtml(commit)}">SpriteCollab, pinned source revision</a>. Community submissions follow <a href="https://creativecommons.org/licenses/by-nc/4.0/">CC BY-NC 4.0</a>: non-commercial use and attribution. <a href="SpriteCollab-LICENSE.md">Copied source license</a> · <a href="SpriteCollab-README.md">Source use policy</a>.</p>
<p>Original official assets retain their respective rights: Pokémon / Nintendo / Creatures / GAME FREAK / Spike Chunsoft. Original PNG pixels are unchanged. Metadata was converted into a runtime JSON manifest and derived black RGBA shadow masks were extracted from source RGB channels; the source XML and credit histories are preserved.</p>
<p>Reference species data: <a href="https://pokeapi.co/">PokéAPI</a>. Raw response snapshots are SHA-256 locked in the project source. These are main-series reference values, not claims of implemented gameplay.</p>
${entries}
</main></html>\n`;
}
