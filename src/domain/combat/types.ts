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
  continueAfterVictory?: boolean;
  seed?: number;
  aiEnabled?: boolean;
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
  noticeRange: number;
  behavior: 'idle' | 'roaming' | 'approach' | 'preparing' | 'active' | 'recovering' | 'defeated' | 'sleeping';
  resolvedSpeed: number;
}
export interface SectorGeometry { kind: 'sector'; origin: Point; angleRadians: number; range: number; angleDegrees: number }
export interface DiskGeometry { kind: 'disk'; origin: Point; radius: number }
export interface LineGeometry { kind: 'line'; origin: Point; angleRadians: number; range: number; width: number }
export interface RingGeometry { kind: 'ring'; origin: Point; innerRadius: number; outerRadius: number; angleRadians: number; angleDegrees: number }
export type AttackGeometry = SectorGeometry | DiskGeometry | LineGeometry | RingGeometry;
export interface ZoneSnapshot {
  id: number;
  castId: number;
  casterId: string;
  moveId: string;
  geometry: AttackGeometry;
  phase: 'pending' | 'active';
  activationTime: number;
  expirationTime: number;
  trajectory?: RingGeometry;
  occluded?: boolean;
}
export interface ProjectileSnapshot {
  id: number;
  castId: number;
  casterId: string;
  moveId: string;
  position: Point;
  previousPosition: Point;
  radius: number;
  remainingRange: number;
  spawnTime?: number;
}
export interface StatusSnapshot { entityId: string; kind: 'sleep'; remainingSeconds: number }
export interface CastSnapshot {
  id: number;
  casterId: string;
  moveId: string;
  phase: 'tracking' | 'locked' | 'active' | 'recovery';
  zoneIds?: number[];
  elapsedSeconds: number;
  aim: Point;
  geometry: AttackGeometry;
}
export interface CombatEvent {
  id: number;
  time: number;
  type: 'cast-start' | 'aim-lock' | 'activation' | 'hit' | 'defeat' | 'cast-cancel' | 'projectile-launch' | 'projectile-impact' | 'sleep-start' | 'sleep-end' | 'cast-rejected' | 'zone-activation' | 'zone-expiration';
  casterId: string;
  moveId?: string;
  targetId?: string;
  position: Point;
  amount?: number;
  reason?: string;
}
export interface EncounterSnapshot {
  time: number;
  result: 'playing' | 'won' | 'lost';
  player: CombatEntity;
  actors: (Omit<CombatActor, 'roaming'> & { velocity: Point })[];
  casts: CastSnapshot[];
  projectiles: ProjectileSnapshot[];
  statuses: StatusSnapshot[];
  zones: ZoneSnapshot[];
  lastFailure: string | null;
  graceSeconds: number;
  cooldowns: Record<string, number>;
}
