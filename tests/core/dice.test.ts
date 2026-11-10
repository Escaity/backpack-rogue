import { describe, expect, it } from 'vitest';
import { averageDice, dice, diceRange, formatDice, rollDice } from '../../src/core/dice';
import { createRng } from '../../src/core/rng';

describe('dice', () => {
  it('formats dice notation', () => {
    expect(formatDice(dice(1, 8, 2))).toBe('1d8+2');
    expect(formatDice(dice(2, 6))).toBe('2d6');
    expect(formatDice(dice(1, 4, -1))).toBe('1d4-1');
    expect(formatDice(dice(0, 1, 5))).toBe('5');
  });

  it('reports range and average', () => {
    expect(diceRange(dice(2, 6, 3))).toEqual([5, 15]);
    expect(averageDice(dice(2, 6, 3))).toBe(10);
    expect(diceRange(dice(0, 1, 5))).toEqual([5, 5]);
  });

  it('rolls within range and covers every value', () => {
    const rng = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rollDice(dice(1, 6, 1), rng);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(7);
      seen.add(v);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it('is deterministic for the same seed', () => {
    const a = createRng(9);
    const b = createRng(9);
    const d = dice(3, 4, 1);
    expect(Array.from({ length: 10 }, () => rollDice(d, a))).toEqual(Array.from({ length: 10 }, () => rollDice(d, b)));
  });

  it('fixed dice (count 0) always return the bonus', () => {
    expect(rollDice(dice(0, 1, 7), createRng(3))).toBe(7);
  });
});
