import { content, movementSettings } from '../content/catalog.ts';
import { relativeMovementSpeed } from '../domain/speed.ts';
import type { Dungeon } from '../content/schemas.ts';
import type { GameState, Point } from '../domain/state.ts';
import { createPokemonAssets } from '../platform/pokemon-assets.ts';
import { createPokemonRenderer } from '../rendering/pokemon.ts';
import { element } from '../ui/dom.ts';
import { createRoamers, updateRoamers } from '../domain/roaming.ts';
import type { EncounterSnapshot } from '../domain/combat/types.ts';

/** Connects authored field actors to locally imported art without species branches. */
export function setupPokemon(field: Dungeon, velocity: () => Point, combat: () => EncounterSnapshot | null = () => null) {
  const playerStat = content.species.find(species => species.id === field.playerSpeciesId)!.stats.speed;
  const actors = createRoamers(field.actors, definition => relativeMovementSpeed(
    content.species.find(species => species.id === definition.speciesId)!.stats.speed,
    playerStat, movementSettings, definition.roaming?.behaviorMultiplier ?? 0,
  ));
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
      }
      state = 'ready';
      status.textContent = `${field.actors.length + 1} Pokémon · animations prêtes`;
    } catch (cause) {
      state = 'error';
      error = cause instanceof Error ? cause.message : String(cause);
      status.textContent = 'Sprites indisponibles · recharge le jeu';
    }
  })();
  function playerActor(game: GameState, visual: Point) {
    const fight = combat();
    if (fight) return { ...fight.player, ...visual,
      animation: fight.player.animation === 'Idle' && Math.hypot(velocity().x, velocity().y) > .01 ? 'Walk' : fight.player.animation,
      animationTimeMs: (fight.casts.find(cast => cast.casterId === 'player')?.elapsedSeconds ?? fight.time) * 1000 };
    const moving = Math.hypot(velocity().x, velocity().y) > .01;
    return {
      id: 'player', speciesId: field.playerSpeciesId,
      x: visual.x, y: visual.y, facing: game.facing,
      animation: moving ? 'Walk' : 'Idle',
    };
  }
  return {
    ready,
    get isReady() { return state === 'ready'; },
    update(dt: number) { if (!combat()) updateRoamers(actors, field, dt); },
    draw(context: CanvasRenderingContext2D, row: number, time: number, game: GameState, visual: Point) {
      if (!painter) return false;
      const player = playerActor(game, visual);
      let playerDrawn = false;
      const fight = combat();
      const visible = [...(fight ? fight.actors.filter(actor => !actor.defeated).map(actor => ({ ...actor,
        animationTimeMs: (fight.casts.find(cast => cast.casterId === actor.id)?.elapsedSeconds ?? fight.time) * 1000 })) : actors), player]
        .filter(actor => Math.floor(actor.y) === row).sort((a, b) => a.y - b.y);
      for (const actor of visible) {
        if (actor.id === 'player') playerDrawn = true;
        painter.draw(context, { ...actor, x: actor.x * 32 + 16, y: actor.y * 32 + 16 }, time * 1000);
      }
      return playerDrawn;
    },
    drawPlayer(context: CanvasRenderingContext2D, game: GameState, visual: Point, time: number) {
      if (!painter) return false;
      const actor = playerActor(game, visual);
      return painter.draw(context, { ...actor, x: actor.x * 32 + 16, y: actor.y * 32 + 16 }, time * 1000);
    },
    snapshot(time: number, game: GameState, visual: Point) {
      const player = playerActor(game, visual);
      return {
        status: state, error,
        player: { ...player, frame: painter?.snapshot(player, time * 1000) },
        actors: combat()?.actors.map(actor => ({ ...actor, frame: painter?.snapshot(actor, time * 1000) })) ?? actors.map(actor => ({ id: actor.id, speciesId: actor.speciesId, x: actor.x, y: actor.y,
          facing: actor.facing, animation: actor.animation, behavior: actor.behavior, velocity: actor.velocity, resolvedSpeed: actor.resolvedSpeed,
          frame: painter?.snapshot(actor, time * 1000) })),
        loaded: assets?.status, elapsed: time,
      };
    },
  };
}
