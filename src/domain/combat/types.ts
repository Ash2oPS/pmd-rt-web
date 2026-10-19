import type { Dungeon, Move, MovementSettings, Species } from '../../content/schemas.ts';
import type { Facing, Point } from '../movement.ts';
import type { Roamer } from '../roaming.ts';
import type { GameState } from '../state.ts';

export interface EncounterOptions {
  field: Dungeon;
  species: readonly Species[];
  moves: readonly Move[];
  movementSettings: MovementSettings;
  state: GameState;
  hostileIds?: readonly string[];
}
export interface CombatEntity extends Point {
  id: string;
  speciesId: string;
  team: 'player' | 'hostile' | 'neutral';
  facing: Facing;
  hp: number;
  maxHp: number;
  defeated: boolean;
  animation: 'Idle' | 'Walk' | 'Attack' | 'Hurt';
}
export interface CombatActor extends CombatEntity {
  roaming: Roamer;
  behavior: 'idle' | 'roaming' | 'approach' | 'preparing' | 'active' | 'recovering' | 'defeated' | 'sleeping';
  resolvedSpeed: number;
}
export interface SectorGeometry { kind: 'sector'; origin: Point; angleRadians: number; range: number; angleDegrees: number }
export interface DiskGeometry { kind: 'disk'; origin: Point; radius: number }
export interface LineGeometry { kind: 'line'; origin: Point; angleRadians: number; range: number; width: number }
export type AttackGeometry = SectorGeometry | DiskGeometry | LineGeometry;
export interface ProjectileSnapshot {
  id: number;
  castId: number;
  casterId: string;
  moveId: string;
  position: Point;
  previousPosition: Point;
  radius: number;
  remainingRange: number;
}
export interface StatusSnapshot { entityId: string; kind: 'sleep'; remainingSeconds: number }
export interface CastSnapshot {
  id: number;
  casterId: string;
  moveId: string;
  phase: 'tracking' | 'locked' | 'active' | 'recovery';
  elapsedSeconds: number;
  aim: Point;
  geometry: AttackGeometry;
}
export interface CombatEvent {
  id: number;
  time: number;
  type: 'cast-start' | 'aim-lock' | 'activation' | 'hit' | 'defeat' | 'cast-cancel' | 'projectile-launch' | 'projectile-impact' | 'sleep-start' | 'sleep-end';
  casterId: string;
  moveId?: string;
  targetId?: string;
  position: Point;
  amount?: number;
}
export interface EncounterSnapshot {
  time: number;
  result: 'playing' | 'won' | 'lost';
  player: CombatEntity;
  actors: Omit<CombatActor, 'roaming'>[];
  casts: CastSnapshot[];
  projectiles: ProjectileSnapshot[];
  statuses: StatusSnapshot[];
  graceSeconds: number;
  cooldowns: Record<string, number>;
}
