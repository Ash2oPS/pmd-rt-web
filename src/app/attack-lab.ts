import { content } from '../content/catalog.ts';
import { labFixtures } from '../content/lab-fixtures.ts';
import { SPRITE_DIRECTIONS } from '../domain/animation.ts';
import type { Facing } from '../domain/movement.ts';
import { setupOffline } from '../platform/offline.ts';
import { createLabSession } from './lab-session.ts';
import { VERSION } from './config.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element('lab-status');
element('lab-build').textContent = `BUILD ${VERSION}`;
const entries = [...content.moves.filter(move => move.combat), ...labFixtures];
let current = entries[0]!, running = false, lastFrame = performance.now(), revision = 0;
setupOffline(element('lab-offline'), element<HTMLButtonElement>('lab-install'), message => { status.textContent = message; });
const session = await createLabSession(element<HTMLCanvasElement>('lab-canvas'));
const caster = element<HTMLSelectElement>('lab-caster'), facing = element<HTMLSelectElement>('lab-facing');
for (const direction of SPRITE_DIRECTIONS) facing.add(new Option(direction, direction));
facing.value = 'right';
function list() {
  const search = element<HTMLInputElement>('lab-search').value.toLocaleLowerCase('fr');
  element('lab-moves').replaceChildren(...entries.filter(move => move.label.toLocaleLowerCase('fr').includes(search)).map(move => {
    const button = document.createElement('button');
    button.textContent = move.label; button.dataset.move = move.id;
    button.setAttribute('aria-current', String(move.id === current.id));
    const detail = document.createElement('small');
    detail.textContent = move.id.startsWith('lab-') ? 'Démonstration technique' : 'Capacité Pokémon'; button.append(detail);
    button.addEventListener('click', () => { void select(move.id); });
    return button;
  }));
}
async function configure() {
  const token = ++revision; running = false;
  status.textContent = 'Chargement de l’aperçu…';
  element<HTMLButtonElement>('lab-play').disabled = true;
  try {
    await session.configure(current, { seed: Math.max(1, Number(element<HTMLInputElement>('lab-seed').value) || 1), casterId: caster.value,
      distance: Math.max(.5, Math.min(5, Number(element<HTMLInputElement>('lab-distance').value) || 1)),
      facing: facing.value as Facing, overlays: element<HTMLInputElement>('lab-overlays').checked });
    if (token !== revision) return;
    element<HTMLButtonElement>('lab-play').disabled = false;
    status.classList.remove('lab-error'); status.textContent = 'Prêt. Rejouer lance la capacité sur une cible passive.';
    update();
  } catch (error) { status.classList.add('lab-error'); status.textContent = error instanceof Error ? error.message : String(error); }
}
async function select(id: string) {
  current = entries.find(move => move.id === id)!;
  element('lab-title').textContent = current.label;
  element('lab-kind').textContent = current.id.startsWith('lab-') ? 'Démonstration technique' : current.type.toLocaleUpperCase('fr');
  element('lab-definition').textContent = JSON.stringify(current, null, 2);
  const compatible = current.id.startsWith('lab-') ? content.species : content.species.filter(species => species.learnset.some(learn => learn.moveId === id));
  const previous = caster.value;
  caster.replaceChildren(...compatible.map(species => new Option(species.label, species.id)));
  if (compatible.some(species => species.id === previous)) caster.value = previous;
  list(); await configure();
}
function update() {
  const view = session.snapshot();
  if (!view) return;
  element('lab-time').textContent = `${view.time.toFixed(2)} s`;
  element<HTMLInputElement>('lab-seek').value = String(view.time);
  if (view.lastFailure) { status.classList.add('lab-error'); status.textContent = view.lastFailure; }
}
element('lab-search').addEventListener('input', list);
for (const id of ['lab-caster', 'lab-seed', 'lab-distance', 'lab-facing', 'lab-overlays']) element(id).addEventListener('change', () => { void configure(); });
element('lab-play').addEventListener('click', () => { running = session.restart(); lastFrame = performance.now(); update(); });
element('lab-pause').addEventListener('click', () => { running = !running; lastFrame = performance.now(); });
element('lab-step').addEventListener('click', () => { running = false; session.advance(1 / 60); update(); });
element('lab-seek').addEventListener('input', () => { running = false; session.seek(Number(element<HTMLInputElement>('lab-seek').value)); update(); });
function frame(now: number) {
  const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now;
  if (running) { session.advance(dt * Number(element<HTMLSelectElement>('lab-rate').value)); update(); if ((session.snapshot()?.time ?? 0) >= 8) running = false; }
  requestAnimationFrame(frame);
}
window.render_attack_lab_to_text = () => JSON.stringify({ version: VERSION, move: current.id, running, encounter: session.snapshot(), presentation: session.presentation() });
window.advance_attack_lab = ms => { session.advance(ms / 1000); update(); };
await select(current.id);
requestAnimationFrame(frame);
