import { describe, expect, it } from 'vitest';
import {
  DUNGEON_SIZE, MAX_FLOOR, MIASMA_SCHEDULE, STAIRS_MIN_DISTANCE, generateDungeon, isClosed, neighbors, ringOf, roomHint, turnsUntilClosed,
} from '../../src/core/dungeon';
import { monstersForFloor } from '../../src/core/monsters';
import { createRng } from '../../src/core/rng';

const gen = (seed: number, depth = 1) => generateDungeon(createRng(seed), depth);

describe('dungeon', () => {
  it('creates a 5x5 map for the given depth', () => {
    const d = gen(1, 2);
    expect(d.size).toBe(DUNGEON_SIZE);
    expect(d.rooms).toHaveLength(25);
    expect(d.depth).toBe(2);
  });

  it('every room is reachable from the start', () => {
    for (let seed = 0; seed < 20; seed++) {
      const d = gen(seed);
      const seen = new Set([d.start]);
      const queue = [d.start];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const n of neighbors(d, cur)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
      expect(seen.size).toBe(25);
    }
  });

  it('links only connect orthogonal neighbours', () => {
    const d = gen(3);
    for (const [a, b] of d.links) {
      const ra = d.rooms[a];
      const rb = d.rooms[b];
      expect(Math.abs(ra.x - rb.x) + Math.abs(ra.y - rb.y)).toBe(1);
    }
  });

  it('places the expected room types for each depth', () => {
    for (const depth of [1, 2, 3]) {
      for (let seed = 0; seed < 10; seed++) {
        const d = gen(seed, depth);
        const count = (type: string) => d.rooms.filter((r) => r.type === type).length;
        expect(count('monster')).toBe(8);
        expect(count('chest')).toBe(5);
        expect(count('trap')).toBe(3);
        expect(count('spring')).toBe(1);
        expect(count('stairs')).toBe(depth < MAX_FLOOR ? 1 : 0);
        expect(d.stairs === null ? 0 : 1).toBe(depth < MAX_FLOOR ? 1 : 0);
        if (d.stairs !== null) expect(d.rooms[d.stairs].type).toBe('stairs');
        expect(d.rooms[d.start].type).toBe('empty');
        expect(ringOf(d.rooms[d.start], d.size)).toBe(2);
        for (const r of d.rooms.filter((x) => x.type === 'monster')) expect(monstersForFloor(depth)).toContain(r.monsterId);
      }
    }
  });

  it('puts the stairs away from the start', () => {
    for (let seed = 0; seed < 30; seed++) {
      const d = gen(seed, 1);
      const s = d.rooms[d.start];
      const st = d.rooms[d.stairs!];
      expect(Math.abs(s.x - st.x) + Math.abs(s.y - st.y)).toBeGreaterThanOrEqual(STAIRS_MIN_DISTANCE);
    }
  });

  it('hints at stairs from a neighbouring room', () => {
    const d = gen(1, 1);
    expect(roomHint(d.rooms[d.stairs!])).toBe('下から風が吹き上がる');
  });

  it('starts with only the start room visited', () => {
    const d = gen(5);
    expect(d.rooms.filter((r) => r.visited).map((r) => r.index)).toEqual([d.start]);
  });

  it('is deterministic for the same seed', () => {
    expect(JSON.stringify(gen(8, 2))).toBe(JSON.stringify(gen(8, 2)));
  });

  it('closes rings according to the miasma schedule', () => {
    const d = gen(1);
    const outer = d.rooms.find((r) => ringOf(r, d.size) === 2)!;
    const center = d.rooms[12];
    const closeAt = (ring: number) => MIASMA_SCHEDULE.find((s) => s.ring === ring)!.turn;
    const outerAt = closeAt(2);
    const centerAt = closeAt(0);
    // 外側から順に閉じる
    expect(outerAt).toBeLessThan(closeAt(1));
    expect(closeAt(1)).toBeLessThan(centerAt);
    expect(isClosed(outer, d.size, outerAt - 1)).toBe(false);
    expect(isClosed(outer, d.size, outerAt)).toBe(true);
    expect(isClosed(center, d.size, centerAt - 1)).toBe(false);
    expect(isClosed(center, d.size, centerAt)).toBe(true);
    expect(turnsUntilClosed(outer, d.size, outerAt - 5)).toBe(5);
  });
});
