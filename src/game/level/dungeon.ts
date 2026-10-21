import { RUN } from '../config';
import { DIRS, type Dir } from '../dir';
import { rollChicken } from '../chickens/chickens';
import { rollPerk } from '../perks/perks';
import { mulberry32, randInt, shuffled, type Rng } from '../util/math';
import {
  cloneRoom,
  doorGapTiles,
  roomEnemies,
  roomPedestals,
  roomSpawn,
  setChar,
  type DoorSide,
  type EggRoom,
  type EnemySpec,
  type PedestalSpec,
  type RoomRole,
} from './roomFormat';
import { TERRAIN, charIsSolid, charIsWater } from './tiles';

export type RewardKind = 'chicken' | 'feed' | 'perk' | 'heart';

export interface RewardPlan {
  kind: RewardKind;
  chickenId?: string;
  perkId?: string;
  amount?: number;
}

export interface ShopEntry {
  price: number;
  plan: RewardPlan;
  sold: boolean;
}

export interface DungeonNode {
  key: string;
  col: number;
  row: number;
  doors: DoorSide[];
  /** The template with door gaps punched and `doors` set. */
  room: EggRoom;
  role: RoomRole;
  cleared: boolean;
  visited: boolean;
  /** Spawned on first entry, then remembered. */
  spawns: EnemySpec[] | null;
  /** Pedestals authored in the template, resolved on entry. */
  authored: PedestalSpec[];
  reward: RewardPlan | null;
  /** True while an untaken reward pedestal should be shown in this room. */
  rewardPending: boolean;
  shop: ShopEntry[] | null;
  /** True for the room containing the trapdoor. */
  hasTrapdoor: boolean;
}

export interface Dungeon {
  seed: number;
  depth: number;
  nodes: Map<string, DungeonNode>;
  startKey: string;
  exitKey: string;
  bossKey: string;
}

const GRID_W = 7;
const GRID_H = 5;
const START_COL = 3;
const START_ROW = 2;

export function nodeKey(col: number, row: number): string {
  return `${col},${row}`;
}

const OFFSETS: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const DOOR_FOR_OFFSET: Record<string, DoorSide> = {
  '0,-1': 'up',
  '1,0': 'right',
  '0,1': 'down',
  '-1,0': 'left',
};

export interface TemplatePools {
  rooms: EggRoom[];
}

function poolForRole(pool: readonly EggRoom[], role: RoomRole): EggRoom[] {
  const exact = pool.filter((room) => room.role === role);
  if (exact.length > 0) {
    return exact;
  }
  // Fall back to any layout so a floor can always be built.
  return pool.filter((room) => room.role !== 'start');
}

function pickTemplate(
  pool: readonly EggRoom[],
  role: RoomRole,
  used: Set<string>,
  rng: Rng,
): EggRoom {
  const candidates = poolForRole(pool, role);
  const fresh = candidates.filter((room) => !used.has(room.id));
  const list = fresh.length > 0 ? fresh : candidates;
  const chosen = list[randInt(rng, 0, list.length)] ?? candidates[0]!;
  used.add(chosen.id);
  return chosen;
}

/** Punch door gaps into a room copy and record which sides are open. */
export function applyDoors(room: EggRoom, doors: readonly DoorSide[]): EggRoom {
  const copy = cloneRoom(room);
  copy.doors = [...doors];
  for (const side of doors) {
    for (const cell of doorGapTiles(copy, side)) {
      setChar(copy, cell.x, cell.y, TERRAIN.floor);
    }
  }
  return copy;
}

function planReward(
  rng: Rng,
  ownedChickens: readonly string[],
  ownedPerks: readonly string[],
  bias: 'combat' | 'treasure' | 'boss' | 'shop',
): RewardPlan {
  const roll = rng();
  if (bias === 'boss') {
    return { kind: 'chicken', chickenId: rollChicken(ownedChickens, rng).id };
  }
  if (bias === 'treasure') {
    if (roll < 0.5) return { kind: 'chicken', chickenId: rollChicken(ownedChickens, rng).id };
    if (roll < 0.82) {
      const perk = rollPerk(ownedPerks, rng);
      if (perk) return { kind: 'perk', perkId: perk.id };
    }
    return { kind: 'feed', amount: randInt(rng, RUN.feedRewardMin, RUN.feedRewardMax + 1) };
  }
  // combat clears favour feed, then chickens, then perks.
  if (roll < 0.55) {
    return { kind: 'feed', amount: randInt(rng, 6, 14) };
  }
  if (roll < 0.8) {
    return { kind: 'chicken', chickenId: rollChicken(ownedChickens, rng).id };
  }
  if (roll < 0.94) {
    const perk = rollPerk(ownedPerks, rng);
    if (perk) return { kind: 'perk', perkId: perk.id };
  }
  return { kind: 'heart' };
}

function planShop(rng: Rng, ownedChickens: readonly string[], ownedPerks: readonly string[]): ShopEntry[] {
  const entries: ShopEntry[] = [];
  const kinds: RewardKind[] = ['chicken', 'perk', 'feed', 'heart'];
  while (entries.length < 3) {
    const kind = kinds[randInt(rng, 0, kinds.length)]!;
    const price = randInt(rng, RUN.shopPriceMin, RUN.shopPriceMax + 1);
    if (kind === 'chicken') {
      entries.push({
        price,
        plan: { kind, chickenId: rollChicken(ownedChickens, rng).id },
        sold: false,
      });
    } else if (kind === 'perk') {
      const perk = rollPerk(ownedPerks, rng);
      if (perk) {
        entries.push({ price, plan: { kind, perkId: perk.id }, sold: false });
      } else {
        entries.push({ price, plan: { kind: 'feed', amount: randInt(rng, 20, 36) }, sold: false });
      }
    } else if (kind === 'feed') {
      entries.push({ price, plan: { kind, amount: randInt(rng, 20, 36) }, sold: false });
    } else {
      entries.push({ price, plan: { kind }, sold: false });
    }
    // Avoid three identical entries; duplicates are still allowed but rare.
  }
  return entries;
}

const EARLY_ENEMIES = ['rat', 'bat', 'snake'];
const MID_ENEMIES = ['rat', 'bat', 'snake', 'cat', 'spider', 'crow'];
const LATE_ENEMIES = ['rat', 'cat', 'fox', 'dog', 'spider', 'crow', 'slime', 'snake', 'bat'];

function enemyPool(depth: number): string[] {
  if (depth <= 1) return EARLY_ENEMIES;
  if (depth === 2) return MID_ENEMIES;
  return LATE_ENEMIES;
}

function openFloorTiles(room: EggRoom): { x: number; y: number }[] {
  const tiles: { x: number; y: number }[] = [];
  for (let y = 2; y < room.height - 2; y++) {
    for (let x = 2; x < room.width - 2; x++) {
      const char = room.tiles[y]!.charAt(x);
      if (charIsSolid(char) || charIsWater(char)) continue;
      tiles.push({ x, y });
    }
  }
  return tiles;
}

function generateSpawns(node: DungeonNode, depth: number, rng: Rng): EnemySpec[] {
  const authored = roomEnemies(node.room);
  if (authored.length > 0) {
    return authored;
  }
  if (node.role === 'start' || node.role === 'shop') {
    return [];
  }
  const pool = enemyPool(depth);
  const open = shuffled(rng, openFloorTiles(node.room));
  const spawn = roomSpawn(node.room);
  const spawns: EnemySpec[] = [];

  if (node.role === 'boss') {
    spawns.push({ type: 'rooster', x: Math.floor(node.room.width / 2), y: 2 });
    const minions = Math.min(2, open.length);
    for (let i = 0; i < minions; i++) {
      const tile = open[i]!;
      spawns.push({ type: pool[randInt(rng, 0, pool.length)]!, x: tile.x, y: tile.y });
    }
    return spawns;
  }

  const count = Math.min(open.length, 3 + depth + randInt(rng, 0, 3));
  let placed = 0;
  for (const tile of open) {
    if (placed >= count) break;
    const dx = tile.x - spawn.x;
    const dy = tile.y - spawn.y;
    if (Math.hypot(dx, dy) < 3.5) continue;
    spawns.push({ type: pool[randInt(rng, 0, pool.length)]!, x: tile.x, y: tile.y });
    placed += 1;
  }
  return spawns;
}

export interface GenerateOptions {
  seed: number;
  depth: number;
  pool: readonly EggRoom[];
  ownedChickens: readonly string[];
  ownedPerks: readonly string[];
  roomTarget?: number;
}

/** Build a floor: a loose grid of .egg rooms wired together by doors. */
export function generateDungeon(options: GenerateOptions): Dungeon {
  const rng = mulberry32(options.seed ^ (options.depth * 0x9e3779b1));
  const target = Math.min(
    RUN.maxRooms,
    options.roomTarget ?? RUN.roomsFloor1 + (options.depth - 1) * RUN.roomsPerFloor,
  );

  const placed = new Map<string, { col: number; row: number }>();
  placed.set(nodeKey(START_COL, START_ROW), { col: START_COL, row: START_ROW });

  let guard = 0;
  while (placed.size < target && guard < 4000) {
    guard += 1;
    const list = [...placed.values()];
    const from = list[randInt(rng, 0, list.length)]!;
    const dir = DIRS[randInt(rng, 0, DIRS.length)]!;
    const offset = OFFSETS[dir];
    const col = from.col + offset.x;
    const row = from.row + offset.y;
    if (col < 0 || row < 0 || col >= GRID_W || row >= GRID_H) continue;
    const key = nodeKey(col, row);
    if (placed.has(key)) continue;
    placed.set(key, { col, row });
  }

  // Doors come from adjacency, so the graph is connected and can have loops.
  const doorMap = new Map<string, DoorSide[]>();
  for (const [key, cell] of placed) {
    const doors: DoorSide[] = [];
    for (const dir of DIRS) {
      const offset = OFFSETS[dir];
      const neighbor = nodeKey(cell.col + offset.x, cell.row + offset.y);
      if (placed.has(neighbor)) {
        doors.push(DOOR_FOR_OFFSET[`${offset.x},${offset.y}`]!);
      }
    }
    doorMap.set(key, doors);
  }

  // BFS distances from the start pick the exit and boss rooms.
  const distances = new Map<string, number>();
  const startKey = nodeKey(START_COL, START_ROW);
  const queue: { key: string; dist: number }[] = [{ key: startKey, dist: 0 }];
  distances.set(startKey, 0);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const cell = placed.get(current.key)!;
    for (const dir of DIRS) {
      const offset = OFFSETS[dir];
      const neighbor = nodeKey(cell.col + offset.x, cell.row + offset.y);
      if (placed.has(neighbor) && !distances.has(neighbor)) {
        distances.set(neighbor, current.dist + 1);
        queue.push({ key: neighbor, dist: current.dist + 1 });
      }
    }
  }

  const ordered = [...placed.keys()].sort((a, b) => (distances.get(b) ?? 0) - (distances.get(a) ?? 0));
  const exitKey = ordered[0]!;
  const bossKey = ordered.find((key) => key !== exitKey && key !== startKey) ?? ordered[0]!;

  const used = new Set<string>();
  const nodes = new Map<string, DungeonNode>();

  const roles = new Map<string, RoomRole>();
  roles.set(startKey, 'start');
  roles.set(exitKey, 'exit');
  roles.set(bossKey, 'boss');

  const remaining = ordered.filter((key) => !roles.has(key));
  const deadEnds = remaining.filter((key) => (doorMap.get(key) ?? []).length === 1);
  const specialPool = deadEnds.length >= 2 ? deadEnds : remaining;
  const treasureKey = specialPool[0];
  const shopKey = specialPool[1] ?? remaining.find((key) => key !== treasureKey);
  if (treasureKey) roles.set(treasureKey, 'treasure');
  if (shopKey) roles.set(shopKey, 'shop');
  for (const key of remaining) {
    if (!roles.has(key)) roles.set(key, 'combat');
  }

  for (const [key, cell] of placed) {
    const role = roles.get(key) ?? 'combat';
    const template = pickTemplate(options.pool, role, used, rng);
    const doors = doorMap.get(key) ?? [];
    const room = applyDoors(template, doors);

    const node: DungeonNode = {
      key,
      col: cell.col,
      row: cell.row,
      doors,
      room,
      role,
      cleared: false,
      visited: false,
      spawns: null,
      authored: roomPedestals(room),
      reward: null,
      rewardPending: false,
      shop: null,
      hasTrapdoor: role === 'exit',
    };

    if (role === 'treasure') {
      node.reward = planReward(rng, options.ownedChickens, options.ownedPerks, 'treasure');
      node.rewardPending = true;
    } else if (role === 'boss') {
      node.reward = planReward(rng, options.ownedChickens, options.ownedPerks, 'boss');
    } else if (role === 'shop') {
      node.shop = planShop(rng, options.ownedChickens, options.ownedPerks);
    }

    nodes.set(key, node);
  }

  return {
    seed: options.seed,
    depth: options.depth,
    nodes,
    startKey,
    exitKey,
    bossKey,
  };
}

/** Lazily roll a combat room's post-clear reward. */
export function combatReward(
  node: DungeonNode,
  rng: Rng,
  ownedChickens: readonly string[],
  ownedPerks: readonly string[],
): RewardPlan {
  if (node.reward) {
    return node.reward;
  }
  node.reward = planReward(rng, ownedChickens, ownedPerks, 'combat');
  return node.reward;
}

export function neighborKey(node: DungeonNode, side: DoorSide): string {
  const offset = OFFSETS[side];
  return nodeKey(node.col + offset.x, node.row + offset.y);
}

/** Spawns are rolled the first time a room is entered and then remembered. */
export function ensureSpawns(node: DungeonNode, depth: number, rng: Rng): EnemySpec[] {
  if (node.spawns) {
    return node.spawns;
  }
  node.spawns = generateSpawns(node, depth, rng);
  return node.spawns;
}
