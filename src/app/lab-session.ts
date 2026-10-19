import { content, field, movementSettings } from '../content/catalog.ts';
import type { Move } from '../content/schemas.ts';
import { createState } from '../domain/state.ts';
import type { Facing } from '../domain/movement.ts';
import { facingFromVector, movePoint } from '../domain/movement.ts';
import { Encounter } from '../domain/combat/encounter.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { createPokemonAssets } from '../platform/pokemon-assets.ts';
import { createRenderer } from '../rendering/renderer.ts';
import { createPokemonRenderer } from '../rendering/pokemon.ts';
import { drawCombatGround, drawCombatOverlay } from '../rendering/combat.ts';
import { combatPose } from '../rendering/combat-pose.ts';
import { setupAttackPresentation } from './attack-presentation.ts';
import type { PresentationOptions } from './attack-presentation.ts';

export interface LabOptions { seed: number; casterId: string; distance: number; facing: Facing; overlays: boolean; targetSpeciesId?: string; targetMoving?: boolean }

/** Authoring transport supplies time to the exact same domain and render functions as live play. */
export async function createLabSession(canvas: HTMLCanvasElement) {
  const assets = await createPokemonAssets(import.meta.env.BASE_URL);
  const painter = createPokemonRenderer(assets.manifest, assets.getSheet);
  let move: Move, options: LabOptions, encounter: Encounter, view: EncounterSnapshot | null = null;
  let events: CombatEvent[] = [];
  let configuration = 0;
  let presentation: ReturnType<typeof setupAttackPresentation> | null = null;
  const world = structuredClone(field);
  world.spawn = { x: 7, y: 5 };
  world.collectibles = [];
  world.actors = [{ id: 'lab-target', speciesId: 'bulbasaur', team: 'hostile', x: 8, y: 5, facing: 'left', animation: 'Idle' }];
  let state = createState(world);
  function reset() {
    state = createState(world); state.facing = options.facing;
    world.playerSpeciesId = options.casterId;
    world.actors[0]!.speciesId = options.targetSpeciesId ?? 'bulbasaur';
    world.actors[0]!.x = world.spawn.x + options.distance;
    const species = content.species.map(entry => ({ ...entry, stats: { ...entry.stats,
      hp: entry.id === world.actors[0]!.speciesId ? 999 : entry.stats.hp },
      learnset: entry.id === options.casterId ? [...entry.learnset.filter(learn => learn.moveId !== move.id), { level: 1, moveId: move.id }] : entry.learnset }));
    const moves = [...content.moves.filter(entry => entry.id !== move.id), move];
    encounter = new Encounter({ field: world, state, species, moves, movementSettings,
      seed: options.seed, aiEnabled: false });
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
        painter.draw(context, { ...combatPose(actor, view, assets.manifest, [move]), x: actor.x * 32 + 16, y: actor.y * 32 + 16 }, view.time * 1000);
      }
      return Math.floor(view.player.y) === row;
    }, undefined,
    { ground: context => { if (view) { if (options?.overlays) drawCombatGround(context, view, world); presentation?.draw(context, view, events, view.time, 'ground'); } },
      overlay: context => { if (view) { if (options?.overlays) drawCombatOverlay(context, view, events, world); presentation?.draw(context, view, events, view.time, 'overlay'); } } });
  function advance(seconds: number) {
    if (!encounter || seconds <= 0) { draw(); return; }
    const steps = Math.max(1, Math.ceil(seconds * 60));
    for (let i = 0; i < steps; i++) {
      const target = encounter.actors[0], dt = seconds / steps;
      let motion = { x: 0, y: 0 };
      if (options.targetMoving && target && !target.defeated && target.behavior !== 'sleeping') {
        const desired = { x: world.spawn.x + options.distance, y: world.spawn.y + Math.sin((encounter.time + dt) * 1.5) * .75 };
        const next = movePoint(world, target, { x: desired.x - target.x, y: desired.y - target.y });
        motion = { x: next.x - target.x, y: next.y - target.y }; target.x = next.x; target.y = next.y;
      }
      encounter.update(seconds / steps);
      if (target && Math.hypot(motion.x, motion.y) > .0001 && target.behavior !== 'sleeping') {
        target.animation = 'Walk'; target.facing = facingFromVector(motion);
      }
      events.push(...encounter.takeEvents());
      events = events.filter(event => encounter.time - event.time < 20).slice(-256);
    }
    view = encounter.snapshot(); draw();
  }
  return {
    async configure(definition: Move, settings: LabOptions, presentationOptions: Omit<PresentationOptions, 'moves' | 'audio'> = {}) {
      const revision = ++configuration;
      const nextPresentation = setupAttackPresentation({ ...presentationOptions, moves: [definition], audio: false });
      await assets.loadSpecies([settings.casterId, settings.targetSpeciesId ?? 'bulbasaur'], ['Idle', 'Walk', 'Attack', 'Hurt']);
      await nextPresentation.loaded;
      if (revision !== configuration) return;
      if (assets.status === 'error') throw new Error(assets.errors.join('; '));
      if (nextPresentation.error) throw new Error(nextPresentation.error);
      presentation = nextPresentation;
      move = structuredClone(definition); options = { ...settings };
      reset(); draw();
    },
    restart() { reset(); const accepted = encounter.requestAttack(move.id); view = encounter.snapshot(); draw(); return accepted; },
    advance,
    seek(seconds: number) { reset(); encounter.requestAttack(move.id); view = encounter.snapshot(); advance(Math.max(0, Math.min(120, seconds))); },
    snapshot() { return view; },
    presentation() { return presentation?.snapshot() ?? null; },
    events() { return [...events]; },
    dispose() { renderer.dispose(); },
  };
}
