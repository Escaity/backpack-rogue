import { describe, expect, it } from 'vitest';
import { type Fighter, FATIGUE_START, simulateCombat } from '../../src/core/combat';
import { BASE_STATS } from '../../src/core/equipment';
import { createRng } from '../../src/core/rng';

function makeFighter(over: Partial<Fighter> = {}): Fighter {
  return {
    name: 'テスト', icon: '🧪', stats: { ...BASE_STATS }, hp: BASE_STATS.maxHp,
    weapons: [{ damage: 5, cooldown: 1, staminaCost: 0 }], periodicHeals: [], consumables: [], ...over,
  };
}

describe('combat', () => {
  it('is deterministic for the same seed', () => {
    const a = makeFighter({ stats: { ...BASE_STATS, evasion: 0.3 } });
    const b = makeFighter({ stats: { ...BASE_STATS, evasion: 0.3 } });
    expect(simulateCombat(a, b, createRng(11))).toEqual(simulateCombat(a, b, createRng(11)));
  });

  it('the stronger fighter wins', () => {
    const a = makeFighter({ weapons: [{ damage: 10, cooldown: 1, staminaCost: 0 }] });
    const b = makeFighter({ weapons: [{ damage: 1, cooldown: 1, staminaCost: 0 }] });
    const r = simulateCombat(a, b, createRng(1));
    expect(r.winner).toBe(0);
    expect(r.finalHp[1]).toBe(0);
  });

  it('defense reduces damage but never below 1', () => {
    const r = simulateCombat(makeFighter(), makeFighter({ stats: { ...BASE_STATS, defense: 100 } }), createRng(1));
    const firstHit = r.events.find((e) => e.kind === 'hit' && e.actor === 0);
    expect(firstHit && firstHit.kind === 'hit' ? firstHit.damage : -1).toBe(1);
  });

  it('evasion 1 makes every attack miss', () => {
    const r = simulateCombat(makeFighter(), makeFighter({ stats: { ...BASE_STATS, evasion: 1 } }), createRng(1));
    expect(r.events.filter((e) => e.kind === 'hit' && e.actor === 0)).toHaveLength(0);
    expect(r.events.some((e) => e.kind === 'miss' && e.actor === 0)).toBe(true);
  });

  it('weapons wait for stamina', () => {
    const a = makeFighter({
      stats: { ...BASE_STATS, maxStamina: 2, staminaRegen: 0 },
      weapons: [{ damage: 1, cooldown: 1, staminaCost: 1 }],
    });
    const b = makeFighter({ hp: 1000, stats: { ...BASE_STATS, maxHp: 1000 } });
    const r = simulateCombat(a, b, createRng(1));
    expect(r.events.filter((e) => e.kind === 'hit' && e.actor === 0)).toHaveLength(2);
  });

  it('uses a consumable when HP drops below the threshold', () => {
    const a = makeFighter({ hp: 20, consumables: [{ uid: 'p1', name: 'ポーション', effect: { hpBelow: 0.5, heal: 20 } }] });
    const r = simulateCombat(a, makeFighter(), createRng(1));
    expect(r.usedConsumables).toEqual(['p1']);
    const heal = r.events.find((e) => e.kind === 'heal');
    expect(heal).toMatchObject({ t: 0.1, actor: 0, amount: 20, hp: 40 });
  });

  it('periodic heals trigger on their interval', () => {
    const a = makeFighter({ hp: 40, weapons: [], periodicHeals: [{ every: 5, heal: 2 }] });
    const r = simulateCombat(a, makeFighter({ weapons: [] }), createRng(1));
    expect(r.events.find((e) => e.kind === 'heal')).toMatchObject({ t: 5, actor: 0, amount: 2, hp: 42 });
  });

  it('fatigue ends stalemates and a double KO counts as a loss for side 0', () => {
    const r = simulateCombat(makeFighter({ weapons: [] }), makeFighter({ weapons: [] }), createRng(1));
    const first = r.events.find((e) => e.kind === 'fatigue');
    expect(first?.t).toBe(FATIGUE_START);
    expect(r.duration).toBe(24);
    expect(r.winner).toBe(1);
  });

  it('reports start and max HP for playback', () => {
    const r = simulateCombat(makeFighter({ hp: 30 }), makeFighter(), createRng(1));
    expect(r.startHp).toEqual([30, 50]);
    expect(r.maxHp).toEqual([50, 50]);
  });
});
