import type { Dungeon } from '../content/schemas.ts';
import type { GameState, Point } from '../domain/state.ts';
import { createPokemonAssets } from '../platform/pokemon-assets.ts';
import { createPokemonRenderer } from '../rendering/pokemon.ts';
import { element } from '../ui/dom.ts';

/** Connects authored field actors to locally imported art without species branches. */
export function setupPokemon(field: Dungeon) {
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
    const moving = Math.abs(visual.x - game.player.x) + Math.abs(visual.y - game.player.y) > .05;
    return {
      id: 'player', speciesId: field.playerSpeciesId,
      x: visual.x, y: visual.y, facing: game.facing,
      animation: moving ? 'Walk' : 'Idle',
    };
  }
  return {
    ready,
    draw(context: CanvasRenderingContext2D, row: number, time: number) {
      if (!painter) return;
      for (const actor of field.actors) {
        if (Math.floor(actor.y) !== row) continue;
        painter.draw(context, { ...actor, x: actor.x * 32 + 16, y: actor.y * 32 + 16 }, time * 1000);
      }
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
        actors: field.actors.map(actor => ({ ...actor, frame: painter?.snapshot(actor, time * 1000) })),
        loaded: assets?.status, elapsed: time,
      };
    },
  };
}
