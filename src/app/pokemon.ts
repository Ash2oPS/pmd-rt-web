import { content } from '../content/catalog.ts';
import type { Dungeon } from '../content/schemas.ts';
import type { EncounterSnapshot } from '../domain/combat/types.ts';
import type { GameState, Point } from '../domain/state.ts';
import { createPokemonAssets } from '../platform/pokemon-assets.ts';
import { createPokemonRenderer } from '../rendering/pokemon.ts';
import { element } from '../ui/dom.ts';
import { combatPose } from '../rendering/combat-pose.ts';

/** Draws the field encounter's actors without creating a second position store. */
export function setupPokemon(field: Dungeon, velocity: () => Point, combat: () => EncounterSnapshot | null = () => null,
  worldAdvancing: () => boolean = () => true) {
  let assets: Awaited<ReturnType<typeof createPokemonAssets>> | null = null;
  let painter: ReturnType<typeof createPokemonRenderer> | null = null;
  let state: 'loading' | 'ready' | 'error' = 'loading';
  let error: string | null = null;
  const status = element('pokemon-status');
  status.textContent = 'Chargement des Pokémon…';
  const ready = (async () => {
    try {
      assets = await createPokemonAssets(import.meta.env.BASE_URL);
      const ids = [field.playerSpeciesId, ...field.actors.map(actor => actor.speciesId)];
      await assets.loadSpecies([...new Set(ids)]);
      const fighters = [...new Set(ids)].filter(id => id === field.playerSpeciesId ||
        content.species.find(species => species.id === id)?.learnset.some(entry =>
          content.moves.some(move => move.id === entry.moveId && move.combat)));
      await assets.loadSpecies(fighters, ['Attack', 'Hurt']);
      const portrait = await assets.loadPortrait(field.playerSpeciesId);
      if (assets.status === 'error') throw new Error(assets.errors.join('; '));
      painter = createPokemonRenderer(assets.manifest, assets.getSheet);
      if (portrait) {
        portrait.alt = 'Rondoudou';
        element('player-portrait').replaceChildren(portrait);
        element('field-portrait').replaceChildren(portrait.cloneNode(true));
      }
      state = 'ready';
      status.textContent = `${field.actors.length + 1} Pokémon · animations prêtes`;
    } catch (cause) {
      state = 'error';
      error = cause instanceof Error ? cause.message : String(cause);
      status.textContent = 'Sprites indisponibles · recharge le jeu';
    }
  })();
  function playerActor(game: GameState, visual: Point, time: number) {
    const fight = combat();
    if (fight) {
      const pose = combatPose(fight.player, fight, assets?.manifest, content.moves, time);
      return { ...pose, ...visual, animation: pose.animation === 'Idle' && Math.hypot(velocity().x, velocity().y) > .01 ? 'Walk' : pose.animation };
    }
    return { id: 'player', speciesId: field.playerSpeciesId, x: visual.x, y: visual.y, facing: game.facing, animation: 'Idle' as const };
  }
  function actorPose(actor: EncounterSnapshot['actors'][number], fight: EncounterSnapshot, time: number) {
    const animation = !worldAdvancing() && actor.animation === 'Walk' ? 'Idle' : actor.animation;
    return combatPose({ ...actor, animation }, fight, assets?.manifest, content.moves, time);
  }
  return {
    ready,
    get isReady() { return state === 'ready'; },
    draw(context: CanvasRenderingContext2D, row: number, time: number, game: GameState, visual: Point) {
      if (!painter) return false;
      const fight = combat();
      const player = playerActor(game, visual, time);
      let playerDrawn = false;
      const actors = fight?.actors.filter(actor => !actor.defeated).map(actor => actorPose(actor, fight, time)) ?? [];
      const visible = [...actors, player].filter(actor => Math.floor(actor.y) === row).sort((a, b) => a.y - b.y);
      for (const actor of visible) {
        if (actor.id === 'player') playerDrawn = true;
        painter.draw(context, { ...actor, x: actor.x * 32 + 16, y: actor.y * 32 + 16 }, time * 1000);
      }
      return playerDrawn;
    },
    drawPlayer(context: CanvasRenderingContext2D, game: GameState, visual: Point, time: number) {
      if (!painter) return false;
      const actor = playerActor(game, visual, time);
      return painter.draw(context, { ...actor, x: actor.x * 32 + 16, y: actor.y * 32 + 16 }, time * 1000);
    },
    snapshot(time: number, game: GameState, visual: Point) {
      const fight = combat();
      const player = playerActor(game, visual, time);
      return {
        status: state, error,
        player: { ...player, frame: painter?.snapshot(player, time * 1000) },
        actors: fight?.actors.map(actor => {
          const pose = actorPose(actor, fight, time);
          return { ...pose, frame: painter?.snapshot(pose, time * 1000) };
        }) ?? [],
        loaded: assets?.status, elapsed: time,
      };
    },
  };
}
