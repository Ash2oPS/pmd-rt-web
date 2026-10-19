import { content } from '../content/catalog.ts';
import { labFixtures } from '../content/lab-fixtures.ts';
import { SPRITE_DIRECTIONS } from '../domain/animation.ts';
import type { Facing } from '../domain/movement.ts';
import { setupOffline } from '../platform/offline.ts';
import { createLabSession } from './lab-session.ts';
import { VERSION } from './config.ts';
import { setupAttackEditor } from './editor-controller.ts';
import type { ValidatedAttackDocument } from '../content/attack-document.ts';
import { resolveVisual } from '../content/visuals.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element('lab-status');
element('lab-build').textContent = `BUILD ${VERSION}`;
const entries = [...content.moves.filter(move => move.combat), ...content.moves.filter(move => !move.combat), ...labFixtures];
const keys = entries.map(move => move.id);
let current = entries[0]!, running = false, lastFrame = performance.now(), revision = 0;
let selectedKey = keys[0]!, lastPreviewKey = '';
let previewEnd = 8;
let authoringState: ValidatedAttackDocument | null = null, imageOverrides: ReadonlyMap<string, CanvasImageSource> = new Map();
setupOffline(element('lab-offline'), element<HTMLButtonElement>('lab-install'), message => { status.textContent = message; });
const session = await createLabSession(element<HTMLCanvasElement>('lab-canvas'));
const caster = element<HTMLSelectElement>('lab-caster'), facing = element<HTMLSelectElement>('lab-facing');
const targetSpecies = element<HTMLSelectElement>('lab-target-species');
for (const species of content.species) targetSpecies.add(new Option(species.label, species.id));
targetSpecies.value = 'bulbasaur';
const directionLabels = ['Bas', 'Bas-droite', 'Droite', 'Haut-droite', 'Haut', 'Haut-gauche', 'Gauche', 'Bas-gauche'];
for (const [index, direction] of SPRITE_DIRECTIONS.entries()) facing.add(new Option(directionLabels[index]!, direction));
facing.value = 'right';
const editor = setupAttackEditor(element('attack-editor'), {
  entry(move, key) {
    selectedKey = key;
    const index = keys.indexOf(key);
    if (index < 0) { keys.push(key); entries.push(move); } else entries[index] = move;
    current = move; list();
  },
  async apply(validated, images) {
    authoringState = validated; imageOverrides = images; current = validated.document.move;
    display(); await configure();
  },
  casterId: () => caster.value || content.species[0]!.id,
  status(message) { status.textContent = message; },
});
function list() {
  const search = element<HTMLInputElement>('lab-search').value.toLocaleLowerCase('fr');
  element('lab-moves').replaceChildren(...entries.flatMap((move, index) => {
    if (!move.label.toLocaleLowerCase('fr').includes(search)) return [];
    const button = document.createElement('button');
    button.textContent = move.label; button.dataset.move = move.id;
    button.setAttribute('aria-current', String(move.id === current.id));
    const detail = document.createElement('small');
    detail.textContent = move.id.startsWith('lab-') ? 'Démonstration technique' : !move.combat ? 'Définition uniquement' : move.sourceMoveId || !content.moves.some(source => source.id === move.id) ? 'Variante de travail' : 'Capacité Pokémon'; button.append(detail);
    button.addEventListener('click', () => { void select(keys[index]!); });
    return [button];
  }));
}
async function configure() {
  const token = ++revision; running = false;
  const previousTime = lastPreviewKey === selectedKey ? session.snapshot()?.time ?? 0 : 0;
  status.textContent = 'Chargement de l’aperçu…';
  element<HTMLButtonElement>('lab-play').disabled = true;
  try {
    await session.configure(current, { seed: Math.max(1, Number(element<HTMLInputElement>('lab-seed').value) || 1), casterId: caster.value,
      distance: Math.max(.5, Math.min(5, Number(element<HTMLInputElement>('lab-distance').value) || 1)),
      facing: facing.value as Facing, overlays: element<HTMLInputElement>('lab-overlays').checked,
      targetSpeciesId: targetSpecies.value, targetMoving: element<HTMLInputElement>('lab-target-moving').checked }, {
        visuals: authoringState?.content['attack-visuals'], assets: authoringState?.content['effect-assets'], imageOverrides,
      });
    if (token !== revision) return;
    element<HTMLButtonElement>('lab-play').disabled = false;
    lastPreviewKey = selectedKey;
    session.restart(); if (previousTime > 0) session.seek(previousTime);
    phases();
    status.classList.remove('lab-error'); status.textContent = 'Prêt. Rejouer lance la capacité sur une cible passive.';
    update();
  } catch (error) { status.classList.add('lab-error'); status.textContent = error instanceof Error ? error.message : String(error); throw error; }
}
function display() {
  element('lab-title').textContent = current.label;
  element('lab-kind').textContent = current.id.startsWith('lab-') ? 'Démonstration technique' : current.type.toLocaleUpperCase('fr');
  element('lab-definition').textContent = JSON.stringify(current, null, 2);
  const catalog = authoringState?.content ?? content;
  let compatible = current.id.startsWith('lab-') ? catalog.species : catalog.species.filter(species => species.learnset.some(learn => learn.moveId === current.id));
  if (!compatible.length) compatible = catalog.species.filter(species => species.learnset.some(learn => learn.moveId === authoringState?.document.sourceMoveId));
  if (!compatible.length) compatible = catalog.species;
  const previous = caster.value;
  caster.replaceChildren(...compatible.map(species => new Option(species.label, species.id)));
  if (compatible.some(species => species.id === previous)) caster.value = previous;
  list();
}
async function select(key: string) {
  const move = entries[keys.indexOf(key)];
  if (move) await editor.select(move, key);
}
function update() {
  const view = session.snapshot();
  if (!view) return;
  element('lab-time').textContent = `${view.time.toFixed(2)} s`;
  element<HTMLInputElement>('lab-seek').value = String(view.time);
  const phase = view.casts.find(cast => cast.casterId === 'player')?.phase;
  element('lab-phase').textContent = phase ? ({ tracking: 'Visée mobile', locked: 'Visée verrouillée', active: 'Activation', recovery: 'Récupération' })[phase]
    : view.zones.some(zone => zone.phase === 'active') || view.projectiles.length ? 'Effet en cours' : 'Repos';
  const target = view.actors[0];
  element('lab-health').textContent = target ? `Cible : ${target.hp} / ${target.maxHp} PV` : '';
  if (view.lastFailure) { status.classList.add('lab-error'); status.textContent = view.lastFailure; }
}
function phases() {
  const rule = current.combat;
  if (!rule) { element('lab-phases').replaceChildren(); return; }
  let mechanicsEnd = rule.preparationSeconds + rule.activeSeconds + rule.recoverySeconds;
  if ('pattern' in rule && rule.pattern.kind === 'projectile') mechanicsEnd = Math.max(mechanicsEnd, rule.preparationSeconds + rule.pattern.range / rule.pattern.speed);
  if ('pattern' in rule && rule.pattern.kind === 'zones') mechanicsEnd = Math.max(mechanicsEnd,
    rule.preparationSeconds + (rule.pattern.waves.count - 1) * rule.pattern.waves.intervalSeconds + rule.pattern.waves.activeSeconds);
  const tracks = resolveVisual(current, authoringState?.content['attack-visuals'] ?? content['attack-visuals'])?.tracks ?? [];
  previewEnd = Math.min(120, Math.max(8, mechanicsEnd + Math.max(0, ...tracks.map(track => track.delaySeconds + track.durationSeconds)) + .5));
  element<HTMLInputElement>('lab-seek').max = String(previewEnd);
  element('lab-phases').replaceChildren(...[['Début', 0], ['Visée figée', rule.trackingSeconds], ['Impact', rule.preparationSeconds],
    ['Récupération', rule.preparationSeconds + rule.activeSeconds], ['Fin', mechanicsEnd]].map(([label, seconds]) => {
      const button = document.createElement('button');
      button.textContent = `${label} · ${Number(seconds).toFixed(2)} s`;
      button.addEventListener('click', () => { running = false; session.seek(Number(seconds)); update(); });
      return button;
    }));
}
element('lab-search').addEventListener('input', list);
for (const id of ['lab-caster', 'lab-seed', 'lab-distance', 'lab-facing', 'lab-overlays', 'lab-target-species', 'lab-target-moving']) element(id).addEventListener('change', () => { void configure().catch(() => undefined); });
element('lab-play').addEventListener('click', () => { running = session.restart(); lastFrame = performance.now(); update(); });
element('lab-pause').addEventListener('click', () => { running = !running; lastFrame = performance.now(); });
element('lab-step').addEventListener('click', () => { running = false; session.advance(1 / 60); update(); });
element('lab-seek').addEventListener('input', () => { running = false; session.seek(Number(element<HTMLInputElement>('lab-seek').value)); update(); });
function frame(now: number) {
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  if (running) { session.advance(dt * Number(element<HTMLSelectElement>('lab-rate').value)); update(); if ((session.snapshot()?.time ?? 0) >= previewEnd) running = false; }
  requestAnimationFrame(frame);
}
window.render_attack_lab_to_text = () => JSON.stringify({ version: VERSION, move: current.id, running, encounter: session.snapshot(), presentation: session.presentation(), editor: editor.snapshot() });
window.advance_attack_lab = ms => { session.advance(ms / 1000); update(); };
await select(current.id);
requestAnimationFrame(frame);
