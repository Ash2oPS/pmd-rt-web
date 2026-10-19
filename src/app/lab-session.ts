import { content, field, movementSettings } from '../content/catalog.ts';
import type { Move } from '../content/schemas.ts';
import { createState } from '../domain/state.ts';
import type { Facing } from '../domain/movement.ts';
import { Encounter } from '../domain/combat/encounter.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { createPokemonAssets } from '../platform/pokemon-assets.ts';
import { createRenderer } from '../rendering/renderer.ts';
import { createPokemonRenderer } from '../rendering/pokemon.ts';
import { drawCombatGround, drawCombatOverlay } from '../rendering/combat.ts';

export interface LabOptions { seed: number; casterId: string; distance: number; facing: Facing; overlays: boolean }

/** Authoring transport supplies time to the exact same domain and render functions as live play. */
export async function createLabSession(canvas: HTMLCanvasElement) {
  const assets = await createPokemonAssets(import.meta.env.BASE_URL);
  const painter = createPokemonRenderer(assets.manifest, assets.getSheet);
  let move: Move, options: LabOptions, encounter: Encounter, view: EncounterSnapshot | null = null;
  let events: CombatEvent[] = [];
  let configuration = 0;
  const world = structuredClone(field);
  world.spawn = { x: 7, y: 5 };
  world.collectibles = [];
  world.actors = [{ id: 'lab-target', speciesId: 'bulbasaur', x: 8, y: 5, facing: 'left', animation: 'Idle' }];
  let state = createState(world);
  function reset() {
    state = createState(world); state.facing = options.facing;
    world.playerSpeciesId = options.casterId;
    world.actors[0]!.x = world.spawn.x + options.distance;
    const species = content.species.map(entry => ({ ...entry, stats: { ...entry.stats,
      hp: entry.id === 'bulbasaur' ? 999 : entry.stats.hp },
      learnset: entry.id === options.casterId ? [...entry.learnset.filter(learn => learn.moveId !== move.id), { level: 1, moveId: move.id }] : entry.learnset }));
    const moves = [...content.moves.filter(entry => entry.id !== move.id), move];
    encounter = new Encounter({ field: world, state, species, moves, movementSettings,
      hostileIds: ['lab-target'], seed: options.seed, aiEnabled: false });
    events = []; view = encounter.snapshot();
  }
  function draw() {
    if (view) renderer.draw(state, state.player, view.time);
  }
  const renderer = createRenderer(canvas, { map: world.map, collectibles: [], tileSize: world.tileSize },
    matchMedia('(prefers-reduced-motion: reduce)').matches,
    (context, row) => {
      if (!view) return false;
      for (const actor of [...view.actors, view.player].filter(actor => !actor.defeated && Math.floor(actor.y) === row).sort((a, b) => a.y - b.y)) {
        painter.draw(context, { ...actor, x: actor.x * 32 + 16, y: actor.y * 32 + 16,
          animationTimeMs: (view.casts.find(cast => cast.casterId === actor.id)?.elapsedSeconds ?? view.time) * 1000 }, view.time * 1000);
      }
      return Math.floor(view.player.y) === row;
    }, undefined,
    { ground: context => { if (view && options?.overlays) drawCombatGround(context, view, world); },
      overlay: context => { if (view) drawCombatOverlay(context, view, events, world); } });
  function advance(seconds: number) {
    if (!encounter || seconds <= 0) { draw(); return; }
    const steps = Math.max(1, Math.ceil(seconds * 60));
    for (let i = 0; i < steps; i++) {
      encounter.update(seconds / steps);
      events.push(...encounter.takeEvents());
      events = events.filter(event => encounter.time - event.time < .8).slice(-100);
    }
    view = encounter.snapshot(); draw();
  }
  return {
    async configure(definition: Move, settings: LabOptions) {
      const revision = ++configuration;
      await assets.loadSpecies([settings.casterId, 'bulbasaur'], ['Idle', 'Walk', 'Attack', 'Hurt']);
      if (revision !== configuration) return;
      if (assets.status === 'error') throw new Error(assets.errors.join('; '));
      move = structuredClone(definition); options = { ...settings };
      reset(); draw();
    },
    restart() { reset(); const accepted = encounter.requestAttack(move.id); view = encounter.snapshot(); draw(); return accepted; },
    advance,
    seek(seconds: number) { reset(); encounter.requestAttack(move.id); view = encounter.snapshot(); advance(Math.max(0, Math.min(15, seconds))); },
    snapshot() { return view; },
    events() { return [...events]; },
    dispose() { renderer.dispose(); },
  };
}
