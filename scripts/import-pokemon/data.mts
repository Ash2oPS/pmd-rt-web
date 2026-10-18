import { z } from 'zod';

const ref = z.object({ name: z.string(), url: z.string() });
const pokemon = z.object({ id: z.number(), name: z.string(), height: z.number(), weight: z.number(),
  types: z.array(z.object({ slot: z.number(), type: ref })),
  stats: z.array(z.object({ base_stat: z.number(), stat: ref })),
  abilities: z.array(z.object({ ability: ref, is_hidden: z.boolean(), slot: z.number() })),
  moves: z.array(z.object({ move: ref, version_group_details: z.array(z.object({
    level_learned_at: z.number(), move_learn_method: ref, version_group: ref,
  })) })),
});
const species = z.object({ names: z.array(z.object({ name: z.string(), language: ref })),
  growth_rate: ref, evolves_from_species: ref.nullable(), evolution_chain: z.object({ url: z.string() }),
  capture_rate: z.number(), gender_rate: z.number(), egg_groups: z.array(ref),
});

export function normalizeSpecies(rawPokemon: unknown, rawSpecies: unknown) {
  const p = pokemon.parse(rawPokemon), s = species.parse(rawSpecies);
  const label = s.names.find((name) => name.language.name === 'fr')?.name;
  if (!label) throw new Error(`Missing French name: ${p.name}`);
  return { id: p.name, dexNumber: p.id, label,
    types: [...p.types].sort((a, b) => a.slot - b.slot).map((value) => value.type.name),
    baseStats: Object.fromEntries(p.stats.map((value) => [value.stat.name, value.base_stat])),
    heightDecimeters: p.height, weightHectograms: p.weight,
    abilities: p.abilities.map((value) => ({ id: value.ability.name, hidden: value.is_hidden, slot: value.slot })),
    growthRate: s.growth_rate.name, evolvesFrom: s.evolves_from_species?.name ?? null,
    evolutionChainUrl: s.evolution_chain.url, captureRate: s.capture_rate, genderRate: s.gender_rate,
    eggGroups: s.egg_groups.map((group) => group.name),
    moves: p.moves.map((value) => ({ id: value.move.name, learnsets: value.version_group_details.map((method) => ({
      versionGroup: method.version_group.name, method: method.move_learn_method.name, level: method.level_learned_at,
    })) })),
  };
}
