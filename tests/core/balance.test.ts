import { describe, expect, it } from 'vitest';
import { fighterFromAdventurer, fighterFromMonster, simulateCombat } from '../../src/core/combat';
import { computeStats, createAdventurer } from '../../src/core/equipment';
import { MONSTER_IDS, getMonster } from '../../src/core/monsters';
import { createRng } from '../../src/core/rng';
import { withFreeKit } from '../../src/core/town';

const SEEDS = 300;

function winRate(startHp: number, monsterId: string): number {
  const kit = withFreeKit(createAdventurer());
  let wins = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = simulateCombat(fighterFromAdventurer({ ...kit, hp: startHp }), fighterFromMonster(getMonster(monsterId)), createRng(seed));
    if (r.winner === 0) wins++;
  }
  return wins / SEEDS;
}

describe('balance (starter kit + old knife)', () => {
  const maxHp = computeStats(withFreeKit(createAdventurer()).equipment).maxHp;

  it('wins against every shallow monster at full HP', () => {
    for (const id of MONSTER_IDS) expect(winRate(maxHp, id), id).toBeGreaterThanOrEqual(0.95);
  });

  it('a ghoul fight at half HP is roughly a coin flip', () => {
    const rate = winRate(Math.floor(maxHp / 2), 'ghoul');
    expect(rate).toBeGreaterThanOrEqual(0.4);
    expect(rate).toBeLessThanOrEqual(0.6);
  });
});
