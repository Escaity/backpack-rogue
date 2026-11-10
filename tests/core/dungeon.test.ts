import { describe, expect, it } from 'vitest';
import {
  DUNGEON_SIZE, EXIT_OPEN_TURN, generateDungeon, isClosed, isExitOpen, neighbors, ringOf, turnsUntilClosed,
} from '../../src/core/dungeon';
import { MONSTER_IDS } from '../../src/core/monsters';
import { createRng } from '../../src/core/rng';

const gen = (seed: number) => generateDungeon(createRng(seed), MONSTER_IDS);

describe('dungeon', () => {
  it('creates a 5x5 map', () => {
    const d = gen(1);
    expect(d.size).toBe(DUNGEON_SIZE);
    expect(d.rooms).toHaveLength(25);
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

  it('places the expected room types', () => {
    for (let seed = 0; seed < 20; seed++) {
      const d = gen(seed);
      const count = (type: string) => d.rooms.filter((r) => r.type === type).length;
      expect(count('exit')).toBe(2);
      expect(count('monster')).toBe(8);
      expect(count('chest')).toBe(5);
      expect(count('trap')).toBe(3);
      expect(count('spring')).toBe(1);
      expect(d.rooms[d.start].type).toBe('empty');
      expect(d.exits).not.toContain(d.start);
      expect(ringOf(d.rooms[d.start], d.size)).toBe(2);
      for (const r of d.rooms.filter((x) => x.type === 'monster')) expect(MONSTER_IDS).toContain(r.monsterId);
    }
  });

  it('starts with only the start room visited', () => {
    const d = gen(5);
    expect(d.rooms.filter((r) => r.visited).map((r) => r.index)).toEqual([d.start]);
  });

  it('is deterministic for the same seed', () => {
    const strip = (seed: number) => JSON.stringify({ ...gen(seed), rooms: gen(seed).rooms.map((r) => r.type) });
    expect(strip(8)).toBe(strip(8));
  });

  it('closes rings according to the miasma schedule', () => {
    const d = gen(1);
    const outer = d.rooms.find((r) => ringOf(r, d.size) === 2)!;
    const center = d.rooms[12];
    expect(isClosed(outer, d.size, 29)).toBe(false);
    expect(isClosed(outer, d.size, 30)).toBe(true);
    expect(isClosed(center, d.size, 59)).toBe(false);
    expect(isClosed(center, d.size, 60)).toBe(true);
    expect(turnsUntilClosed(outer, d.size, 25)).toBe(5);
  });

  it('opens exits at the configured turn', () => {
    expect(isExitOpen(EXIT_OPEN_TURN - 1)).toBe(false);
    expect(isExitOpen(EXIT_OPEN_TURN)).toBe(true);
  });
});
