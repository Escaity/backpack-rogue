import type { Rng } from './rng';

/** count 個の sides 面ダイスを振り、bonus を足す（count が 0 なら常に bonus） */
export interface Dice {
  count: number;
  sides: number;
  bonus: number;
}

export function dice(count: number, sides: number, bonus = 0): Dice {
  return { count, sides, bonus };
}

export function rollDice(d: Dice, rng: Rng): number {
  let total = d.bonus;
  for (let i = 0; i < d.count; i++) total += rng.int(1, d.sides);
  return total;
}

export function diceRange(d: Dice): [number, number] {
  return [d.count + d.bonus, d.count * d.sides + d.bonus];
}

export function averageDice(d: Dice): number {
  return (d.count * (d.sides + 1)) / 2 + d.bonus;
}

export function formatDice(d: Dice): string {
  if (d.count === 0) return `${d.bonus}`;
  const base = `${d.count}d${d.sides}`;
  if (d.bonus > 0) return `${base}+${d.bonus}`;
  if (d.bonus < 0) return `${base}${d.bonus}`;
  return base;
}
