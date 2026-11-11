import { describe, expect, it } from 'vitest';
import { type CombatEvent, type CombatResult, type Fighter, simulateCombat } from '../../src/core/combat';
import { dice } from '../../src/core/dice';
import { BASE_STATS } from '../../src/core/equipment';
import type { ToolEffect } from '../../src/core/items';
import { createRng } from '../../src/core/rng';
import type { SeqEntry } from '../../src/core/sequencer';

function tool(uid: string, cols: number[], cooldown: number, effect: ToolEffect, charges: number | null = null): SeqEntry {
  return { uid, label: `🧪${uid}`, cols, top: 0, left: cols[0], cooldown, effect, charges };
}

function fighter(over: Partial<Fighter> = {}): Fighter {
  return {
    name: 'テスト', icon: '🧪', stats: { ...BASE_STATS }, hp: BASE_STATS.maxHp,
    weapons: [], periodicHeals: [], consumables: [], bagWidth: 0, sequence: [], ...over,
  };
}

/** HP 1000 の頑丈な相手（長時間のタイミング検証用） */
function sturdy(over: Partial<Fighter> = {}): Fighter {
  return fighter({ hp: 1000, stats: { ...BASE_STATS, maxHp: 1000 }, ...over });
}

function usesOf(r: CombatResult, uid: string): CombatEvent[] {
  return r.events.filter((e) => e.actor === 0 && 'uid' in e && e.uid === uid);
}

describe('sequencer combat', () => {
  it('moves the cursor one column per second and wraps around', () => {
    const r = simulateCombat(sturdy({ bagWidth: 4 }), sturdy(), createRng(1));
    const cursor = r.events.filter((e) => e.kind === 'cursor');
    expect(cursor.slice(0, 6).map((e) => [e.t, e.kind === 'cursor' ? e.col : -1])).toEqual([[1, 0], [2, 1], [3, 2], [4, 3], [5, 0], [6, 1]]);
    expect(cursor.every((e) => e.actor === 0)).toBe(true);
  });

  it('a vertical tool misses its chance when the CT is longer than one lap', () => {
    const a = sturdy({ bagWidth: 4, sequence: [tool('v', [0], 5, { kind: 'guard', amount: 1 })] });
    expect(usesOf(simulateCombat(a, sturdy(), createRng(1)), 'v').slice(0, 3).map((e) => e.t)).toEqual([1, 9, 17]);
  });

  it('a horizontal tool catches the next column instead', () => {
    const a = sturdy({ bagWidth: 4, sequence: [tool('h', [0, 1], 5, { kind: 'guard', amount: 1 })] });
    expect(usesOf(simulateCombat(a, sturdy(), createRng(1)), 'h').slice(0, 4).map((e) => e.t)).toEqual([1, 6, 13, 18]);
  });

  it('damage tools roll dice and respect defense and evasion', () => {
    const knife = tool('k', [0], 2, { kind: 'damage', dice: dice(0, 1, 4) });
    const hit = usesOf(simulateCombat(sturdy({ bagWidth: 1, sequence: [knife] }), sturdy({ stats: { ...BASE_STATS, maxHp: 1000, defense: 1 } }), createRng(1)), 'k')[0];
    expect(hit).toMatchObject({ kind: 'toolHit', t: 1, roll: 4, damage: 3, dice: '4' });
    const misses = usesOf(simulateCombat(sturdy({ bagWidth: 1, sequence: [knife] }), sturdy({ stats: { ...BASE_STATS, maxHp: 1000, evasion: 1 } }), createRng(1)), 'k');
    expect(misses.length).toBeGreaterThan(0);
    expect(misses.every((e) => e.kind === 'toolMiss')).toBe(true);
  });

  it('sharpen adds dice to the next weapon attack only', () => {
    const a = sturdy({
      bagWidth: 4,
      weapons: [{ dice: dice(0, 1, 5), cooldown: 1, staminaCost: 0 }],
      sequence: [tool('s', [0], 3, { kind: 'sharpen', dice: dice(0, 1, 3) })],
    });
    const hits = simulateCombat(a, sturdy(), createRng(1)).events.filter((e) => e.kind === 'hit' && e.actor === 0);
    expect(hits.slice(0, 3).map((e) => (e.kind === 'hit' ? [e.t, e.bonus, e.damage] : []))).toEqual([[1, 0, 5], [2, 3, 8], [3, 0, 5]]);
  });

  it('guard reduces the next hit taken, down to zero', () => {
    const a = sturdy({ bagWidth: 4, sequence: [tool('g', [0], 3, { kind: 'guard', amount: 3 })] });
    const strong = sturdy({ weapons: [{ dice: dice(0, 1, 5), cooldown: 1.5, staminaCost: 0 }] });
    const hits = simulateCombat(a, strong, createRng(1)).events.filter((e) => e.kind === 'hit' && e.actor === 1);
    expect(hits.slice(0, 2).map((e) => (e.kind === 'hit' ? [e.t, e.blocked, e.damage] : []))).toEqual([[1.5, 3, 2], [3, 0, 5]]);
    const weak = sturdy({ weapons: [{ dice: dice(0, 1, 2), cooldown: 1.5, staminaCost: 0 }] });
    const first = simulateCombat(a, weak, createRng(1)).events.find((e) => e.kind === 'hit' && e.actor === 1);
    expect(first).toMatchObject({ blocked: 2, damage: 0 });
  });

  // 15 秒以降は疲労で HP が減り、薬草が再び発動してしまう。そこで、3 秒で相手を倒す武器を持たせて戦闘を短く終わらせる
  const finisher = [{ dice: dice(0, 1, 100), cooldown: 3, staminaCost: 0 }];

  it('heal tools wait while HP is full and are spent when charges run out', () => {
    const herb = tool('h', [0], 4, { kind: 'heal', dice: dice(0, 1, 5) }, 3);
    const full = simulateCombat(fighter({ bagWidth: 4, sequence: [herb], weapons: finisher }), fighter(), createRng(1));
    expect(usesOf(full, 'h')).toHaveLength(0);
    expect(full.toolCharges.h).toBeUndefined();
    expect(full.spentItems).toEqual([]);
    const hurt = simulateCombat(fighter({ hp: 30, bagWidth: 4, sequence: [herb] }), fighter(), createRng(1));
    expect(usesOf(hurt, 'h').map((e) => (e.kind === 'heal' ? e.hp : -1))).toEqual([35, 40, 45]);
    expect(hurt.spentItems).toEqual(['h']);
  });

  it('heal tools wait until the missing HP is at least the expected heal', () => {
    const herb = tool('h', [0], 4, { kind: 'heal', dice: dice(1, 4, 1) }, 3); // 期待値 3.5
    const scratched = simulateCombat(fighter({ hp: 47, bagWidth: 4, sequence: [herb], weapons: finisher }), fighter(), createRng(1));
    expect(usesOf(scratched, 'h')).toHaveLength(0);
    const hurt = simulateCombat(fighter({ hp: 46, bagWidth: 4, sequence: [herb], weapons: finisher }), fighter(), createRng(1));
    expect(usesOf(hurt, 'h')).toHaveLength(1);
  });

  it('stamina tools wait until the missing stamina is at least the amount', () => {
    const jerky = tool('j', [0], 4, { kind: 'stamina', amount: 3 });
    const sipping = sturdy({
      bagWidth: 4,
      stats: { ...BASE_STATS, maxHp: 1000, staminaRegen: 0 },
      weapons: [{ dice: dice(0, 1, 1), cooldown: 1, staminaCost: 2 }],
      sequence: [jerky],
    });
    // t=1 に武器でスタミナ 10→8（不足 2 < 3）なので、干し肉はまだ使わない
    expect(usesOf(simulateCombat(sipping, sturdy(), createRng(1)), 'j')[0]?.t).not.toBe(1);
  });

  it('reports partially used charges', () => {
    const herb = tool('h', [0], 4, { kind: 'heal', dice: dice(0, 1, 5) }, 3);
    const r = simulateCombat(fighter({ hp: 45, bagWidth: 4, sequence: [herb], weapons: finisher }), fighter(), createRng(1));
    expect(r.toolCharges.h).toBe(2);
  });

  it('a one-shot bomb fires once and is spent', () => {
    const bomb = tool('b', [0], 0, { kind: 'damage', dice: dice(0, 1, 6) }, 1);
    const r = simulateCombat(sturdy({ bagWidth: 4, sequence: [bomb] }), sturdy(), createRng(1));
    expect(usesOf(r, 'b').map((e) => e.t)).toEqual([1]);
    expect(r.spentItems).toEqual(['b']);
  });

  it('stamina tools only fire when stamina is missing', () => {
    const jerky = tool('j', [0], 4, { kind: 'stamina', amount: 3 });
    const rested = simulateCombat(sturdy({ bagWidth: 4, sequence: [jerky] }), sturdy(), createRng(1));
    expect(usesOf(rested, 'j')).toHaveLength(0);
    const tired = sturdy({
      bagWidth: 4,
      stats: { ...BASE_STATS, maxHp: 1000, staminaRegen: 0 },
      weapons: [{ dice: dice(0, 1, 1), cooldown: 1, staminaCost: 4 }],
      sequence: [jerky],
    });
    expect(usesOf(simulateCombat(tired, sturdy(), createRng(1)), 'j')[0]).toMatchObject({ kind: 'buff', t: 1 });
  });
});
