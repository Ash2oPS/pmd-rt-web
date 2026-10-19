import type { Move } from '../content/schemas.ts';
import { labFixtures } from '../content/lab-fixtures.ts';
import { action, field, node, objectFields, section } from './editor-fields.ts';
import type { EditorPath, FieldContext } from './editor-fields.ts';

const patterns: Record<string, object> = {
  sector: { kind: 'sector', range: 1.5, angleDegrees: 90 },
  'self-disk': { kind: 'self-disk', radius: 2 },
  'target-disk': { kind: 'target-disk', radius: 1, targetingRange: 5 },
  projectile: { kind: 'projectile', range: 6, width: .4, speed: 7, radius: .2 },
  zones: labFixtures.find(move => move.combat && 'pattern' in move.combat && move.combat.pattern.kind === 'zones')!.combat!,
};
const zoneExample = labFixtures.find(move => move.combat && 'pattern' in move.combat && move.combat.pattern.kind === 'zones')!.combat!;
if ('pattern' in zoneExample) patterns.zones = zoneExample.pattern;
const shapes = { disk: { kind: 'disk', radius: .6 }, sector: { kind: 'sector', range: 2, angleDegrees: 90 },
  ring: { kind: 'ring', innerRadius: 1, outerRadius: 2, angleDegrees: 360 }, line: { kind: 'line', length: 3, width: .4 } };
const placements = { caster: { kind: 'caster' }, target: { kind: 'target', targetingRange: 5 }, forward: { kind: 'forward', distance: 2 } };
const distributions = { single: { kind: 'single' }, offsets: { kind: 'offsets', offsets: [{ x: 0, y: 0 }] },
  'random-disk': { kind: 'random-disk', count: 4, radius: 2 }, circle: { kind: 'circle', count: 3, radius: 1.5 } };
const motions = { fixed: { kind: 'fixed' }, orbit: { kind: 'orbit', angularSpeedDegrees: 120, followCaster: true } };
const policies = { 'once-per-cast': { kind: 'once-per-cast' }, 'once-per-zone': { kind: 'once-per-zone' },
  periodic: { kind: 'periodic', intervalSeconds: .5, maxHitsPerTarget: 4 } };
function variant(parent: HTMLElement, context: FieldContext, path: EditorPath, title: string,
  value: { kind: string }, templates: Record<string, object>): HTMLElement {
  const group = section(title, parent);
  field(group, context, [...path, 'kind'], 'Comportement', value.kind, Object.keys(templates), selected => {
    context.change(path, structuredClone(templates[String(selected)]));
  });
  return group;
}

export function combatFields(parent: HTMLElement, context: FieldContext, move: Move): void {
  const identity = section('Capacité', parent);
  field(identity, context, ['move', 'id'], 'Identifiant stable', move.id);
  field(identity, context, ['move', 'label'], 'Nom', move.label);
  field(identity, context, ['move', 'type'], 'Type Pokémon', move.type,
    ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']);
  field(identity, context, ['move', 'category'], 'Catégorie', move.category, ['physical', 'special', 'status']);
  field(identity, context, ['move', 'power'], 'Puissance', move.power);
  identity.append(node('p', 'La précision et les PP restent des valeurs de référence, sans effet sur ce combat.', 'editor-hint'));
  if (!move.combat) {
    parent.append(action('Ajouter un comportement de combat', () => context.change(['move', 'combat'], {
      preparationSeconds: .6, trackingSeconds: .2, activeSeconds: .15, recoverySeconds: .3, cooldownSeconds: 1,
      movementDuringPreparation: 0, pattern: patterns.sector, effect: { kind: 'damage' },
    }))); return;
  }
  const timings = section('Temps et mouvement', parent);
  for (const key of ['preparationSeconds', 'trackingSeconds', 'activeSeconds', 'recoverySeconds', 'cooldownSeconds', 'movementDuringPreparation'] as const)
    field(timings, context, ['move', 'combat', key], ({ preparationSeconds: 'Préparation (s)', trackingSeconds: 'Visée mobile (s)',
      activeSeconds: 'Durée active (s)', recoverySeconds: 'Récupération (s)', cooldownSeconds: 'Recharge (s)',
      movementDuringPreparation: 'Déplacement pendant la préparation (0–1)' })[key], move.combat[key]);
  if (!('pattern' in move.combat)) {
    parent.append(action('Convertir ce contact en pattern modulaire', () => context.change(['move', 'combat'], {
      preparationSeconds: move.combat!.preparationSeconds, trackingSeconds: move.combat!.trackingSeconds,
      activeSeconds: move.combat!.activeSeconds, recoverySeconds: move.combat!.recoverySeconds, cooldownSeconds: move.combat!.cooldownSeconds,
      movementDuringPreparation: move.combat!.movementDuringPreparation,
      pattern: { kind: 'sector', range: 'range' in move.combat! ? move.combat!.range : 1, angleDegrees: 'angleDegrees' in move.combat! ? move.combat!.angleDegrees : 90 },
      effect: { kind: 'damage' },
    }))); return;
  }
  const pattern = move.combat.pattern, path = ['move', 'combat', 'pattern'];
  const geometry = variant(parent, context, path, 'Zone et trajectoire', pattern, patterns);
  if (pattern.kind === 'zones') {
    for (const [key, title, templates] of [
      ['shape', 'Forme', shapes], ['placement', 'Placement', placements], ['distribution', 'Répartition', distributions],
      ['motion', 'Mouvement', motions], ['hitPolicy', 'Règle de contact', policies],
    ] as const) {
      const group = variant(geometry, context, [...path, key], title, pattern[key], templates);
      objectFields(group, context, [...path, key], pattern[key]);
    }
    objectFields(section('Vagues', geometry), context, [...path, 'waves'], pattern.waves);
  } else objectFields(geometry, context, path, pattern);
  const effects = { damage: { kind: 'damage' }, sleep: { kind: 'sleep', durationSeconds: 2, wakeOnHit: true } };
  const effect = variant(parent, context, ['move', 'combat', 'effect'], 'Effet', move.combat.effect, effects);
  objectFields(effect, context, ['move', 'combat', 'effect'], move.combat.effect);
}
