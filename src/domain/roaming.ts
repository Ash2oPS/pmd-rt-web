import type { Dungeon } from '../content/schemas';
import { canOccupy, facingFromVector, movePoint } from './movement';
import type { CollisionWorld, Facing, Point } from './movement';

type ActorDefinition = Dungeon['actors'][number];
type RoamingProfile = NonNullable<ActorDefinition['roaming']>;

export interface Roamer {
  id: string;
  speciesId: string;
  x: number;
  y: number;
  facing: Facing;
  animation: 'Idle' | 'Walk';
  behavior: 'Idle' | 'Roaming';
  velocity: Point;
  home: Point;
  target: Point | null;
  profile: RoamingProfile | null;
  remaining: number;
  blockedSeconds: number;
  seed: number;
}

function seedFromId(id: string): number {
  let seed = 2166136261;
  for (const character of id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function random(actor: Roamer): number {
  actor.seed = (Math.imul(actor.seed, 1664525) + 1013904223) >>> 0;
  return actor.seed / 4294967296;
}

function beginIdle(actor: Roamer): void {
  actor.behavior = 'Idle';
  actor.animation = 'Idle';
  actor.velocity = { x: 0, y: 0 };
  actor.target = null;
  actor.blockedSeconds = 0;
  const profile = actor.profile;
  actor.remaining = profile
    ? profile.idleMinSeconds + random(actor) * (profile.idleMaxSeconds - profile.idleMinSeconds)
    : Infinity;
}

export function createRoamers(definitions: readonly ActorDefinition[]): Roamer[] {
  return definitions.map((definition) => {
    const actor: Roamer = {
      id: definition.id, speciesId: definition.speciesId,
      x: definition.x, y: definition.y, facing: definition.facing,
      animation: definition.animation, behavior: 'Idle',
      velocity: { x: 0, y: 0 }, home: { x: definition.x, y: definition.y },
      target: null, profile: definition.roaming ?? null,
      remaining: Infinity, blockedSeconds: 0, seed: seedFromId(definition.id),
    };
    if (actor.profile) beginIdle(actor);
    return actor;
  });
}

function clearPath(world: CollisionWorld, start: Point, target: Point): boolean {
  const dx = target.x - start.x, dy = target.y - start.y;
  const samples = Math.ceil(Math.hypot(dx, dy) / 0.1);
  for (let sample = 1; sample <= samples; sample++) {
    if (!canOccupy(world, {
      x: start.x + dx * sample / samples,
      y: start.y + dy * sample / samples,
    })) return false;
  }
  return true;
}

function beginRoaming(actor: Roamer, world: CollisionWorld): void {
  const profile = actor.profile;
  if (!profile) return;
  for (let attempt = 0; attempt < 16; attempt++) {
    const angle = random(actor) * Math.PI * 2;
    const radius = Math.sqrt(random(actor)) * profile.radius;
    const target = {
      x: actor.home.x + Math.cos(angle) * radius,
      y: actor.home.y + Math.sin(angle) * radius,
    };
    const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
    if (distance < 0.35 || !clearPath(world, actor, target)) continue;
    actor.target = target;
    actor.behavior = 'Roaming';
    actor.remaining = distance / profile.speed + 0.6;
    actor.blockedSeconds = 0;
    return;
  }
  beginIdle(actor);
}

function tick(actor: Roamer, world: CollisionWorld, dt: number): void {
  if (!actor.profile) return;
  actor.remaining -= dt;
  if (actor.behavior === 'Idle') {
    if (actor.remaining <= 0) beginRoaming(actor, world);
    if (actor.behavior === 'Idle') return;
  }
  const target = actor.target;
  if (!target || actor.remaining <= 0) { beginIdle(actor); return; }
  const dx = target.x - actor.x, dy = target.y - actor.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.015) { beginIdle(actor); return; }
  const length = Math.min(actor.profile.speed * dt, distance);
  const next = movePoint(world, actor, { x: dx / distance * length, y: dy / distance * length });
  actor.velocity = { x: (next.x - actor.x) / dt, y: (next.y - actor.y) / dt };
  const moved = Math.hypot(next.x - actor.x, next.y - actor.y);
  actor.x = next.x;
  actor.y = next.y;
  if (moved <= 0.00001) { beginIdle(actor); return; }
  actor.animation = 'Walk';
  actor.facing = facingFromVector(actor.velocity);
  actor.blockedSeconds = moved < length * 0.1 ? actor.blockedSeconds + dt : 0;
  if (actor.blockedSeconds > 0.35 || distance <= length) beginIdle(actor);
}

/** Advance only while the expedition is active. Coordinates are continuous tile-center indices. */
export function updateRoamers(actors: readonly Roamer[], world: CollisionWorld, dtSeconds: number): void {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  const steps = Math.ceil(dtSeconds / 0.025);
  const dt = dtSeconds / steps;
  for (let step = 0; step < steps; step++) {
    for (const actor of actors) tick(actor, world, dt);
  }
}
