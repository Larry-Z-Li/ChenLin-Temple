import type * as THREE from 'three';
import type { CollisionWorld } from './collisions';
import type { Ground } from './ground';
import type { InteractionSystem } from './interaction';

/** Anywhere a person can sit: hall cushions (kneel) and garden benches. Occupancy is server-authoritative. */
export interface Seat {
  id: string;
  kind: 'cushion' | 'bench';
  hallId?: string;
  x: number;
  y: number;
  z: number;
  /** Player yaw when seated (cushions face the altar = north). */
  yaw: number;
  /** Offset to step to when getting up. */
  exit: [number, number];
  occupiedBy: string | null;
}

/** Hooks a future offering system can use (incense, fruit). */
export interface OfferingTable {
  hallId: string;
  x: number;
  y: number;
  z: number;
  length: number;
  slots: { x: number; y: number; z: number }[];
}

/** Shared registries filled while building the world. */
export interface WorldContext {
  scene: THREE.Scene;
  collisions: CollisionWorld;
  ground: Ground;
  interactions: InteractionSystem;
  /** Meshes the third-person camera must not pass through. */
  cameraBlockers: THREE.Object3D[];
  seats: Map<string, Seat>;
  offeringTables: OfferingTable[];
  updaters: ((dt: number, time: number) => void)[];
}
