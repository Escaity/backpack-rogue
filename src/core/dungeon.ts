import type { ItemInstance } from './items';
import type { Rng } from './rng';

export type RoomType = 'empty' | 'monster' | 'chest' | 'trap' | 'spring' | 'exit';

export interface Room {
  index: number;
  x: number;
  y: number;
  type: RoomType;
  monsterId: string | null;
  visited: boolean;
  /** モンスター撃破済み / 宝箱開封済み / 泉使用済み / 罠発動済み */
  cleared: boolean;
  floor: ItemInstance[];
}

export interface Dungeon {
  size: number;
  rooms: Room[];
  links: [number, number][];
  start: number;
  exits: number[];
}

export const DUNGEON_SIZE = 5;
export const EXTRA_LINKS = 4;
export const EXIT_COUNT = 2;
export const EXIT_OPEN_TURN = 12;
export const MIASMA_SCHEDULE: readonly { ring: number; turn: number }[] = [
  { ring: 2, turn: 30 },
  { ring: 1, turn: 45 },
  { ring: 0, turn: 60 },
];
export const MIASMA_WARNING = 5;

const ROOM_PLAN: readonly [RoomType, number][] = [['monster', 8], ['chest', 5], ['trap', 3], ['spring', 1]];

export function ringOf(room: { x: number; y: number }, size: number): number {
  const c = (size - 1) / 2;
  return Math.max(Math.abs(room.x - c), Math.abs(room.y - c));
}

export function turnsUntilClosed(room: { x: number; y: number }, size: number, turn: number): number | null {
  const entry = MIASMA_SCHEDULE.find((s) => s.ring === ringOf(room, size));
  return entry ? entry.turn - turn : null;
}

export function isClosed(room: { x: number; y: number }, size: number, turn: number): boolean {
  const left = turnsUntilClosed(room, size, turn);
  return left !== null && left <= 0;
}

export function isExitOpen(turn: number): boolean {
  return turn >= EXIT_OPEN_TURN;
}

export function neighbors(d: Dungeon, index: number): number[] {
  return d.links.flatMap(([a, b]) => (a === index ? [b] : b === index ? [a] : []));
}

function gridNeighbors(index: number, size: number): number[] {
  const x = index % size;
  const y = Math.floor(index / size);
  const out: number[] = [];
  if (x > 0) out.push(index - 1);
  if (x < size - 1) out.push(index + 1);
  if (y > 0) out.push(index - size);
  if (y < size - 1) out.push(index + size);
  return out;
}

function pair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function generateDungeon(rng: Rng, monsterIds: readonly string[]): Dungeon {
  const size = DUNGEON_SIZE;
  const rooms: Room[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rooms.push({ index: y * size + x, x, y, type: 'empty', monsterId: null, visited: false, cleared: false, floor: [] });
    }
  }
  const start = rng.pick(rooms.filter((r) => ringOf(r, size) === (size - 1) / 2)).index;

  const links: [number, number][] = [];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const options = gridNeighbors(cur, size).filter((i) => !seen.has(i));
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const next = rng.pick(options);
    links.push(pair(cur, next));
    seen.add(next);
    stack.push(next);
  }
  let added = 0;
  for (let attempt = 0; attempt < 100 && added < EXTRA_LINKS; attempt++) {
    const a = rng.int(0, size * size - 1);
    const [p, q] = pair(a, rng.pick(gridNeighbors(a, size)));
    if (!links.some(([l1, l2]) => l1 === p && l2 === q)) {
      links.push([p, q]);
      added++;
    }
  }

  const s = rooms[start];
  const far = rooms.filter((r) => Math.abs(r.x - s.x) + Math.abs(r.y - s.y) >= 4);
  const exits = rng.shuffle(far).slice(0, EXIT_COUNT).map((r) => r.index);
  for (const e of exits) rooms[e].type = 'exit';

  const rest = rng.shuffle(rooms.filter((r) => r.index !== start && !exits.includes(r.index)));
  let cursor = 0;
  for (const [type, count] of ROOM_PLAN) {
    for (let i = 0; i < count; i++) {
      const room = rest[cursor++];
      room.type = type;
      if (type === 'monster') room.monsterId = rng.pick(monsterIds);
    }
  }

  rooms[start].visited = true;
  rooms[start].cleared = true;
  return { size, rooms, links, start, exits };
}

/** 隣の未訪問の部屋から感じ取れる気配 */
export function roomHint(room: Room): string {
  switch (room.type) {
    case 'monster': return '物音がする';
    case 'chest': return '金属の匂い';
    case 'trap': return '嫌な気配';
    case 'spring': return '水音';
    case 'exit': return '冷たい風';
    case 'empty': return '静か';
  }
}
