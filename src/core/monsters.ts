import { dice } from './dice';
import type { WeaponStats } from './items';

export interface MonsterDef {
  id: string;
  name: string;
  icon: string;
  maxHp: number;
  defense: number;
  evasion: number;
  weapon: WeaponStats;
  drops: readonly { defId: string; chance: number }[];
  gold: readonly [number, number];
}

const DEFS: MonsterDef[] = [
  { id: 'rat', name: '大ネズミ', icon: '🐀', maxHp: 15, defense: 0, evasion: 0.1, weapon: { dice: dice(1, 3), cooldown: 1.0, staminaCost: 0 },
    drops: [{ defId: 'black_bread', chance: 0.3 }], gold: [0, 5] },
  { id: 'goblin', name: 'ゴブリン', icon: '👺', maxHp: 30, defense: 0, evasion: 0.15, weapon: { dice: dice(1, 6, 1), cooldown: 1.2, staminaCost: 0 },
    drops: [{ defId: 'dagger', chance: 0.2 }, { defId: 'gloves', chance: 0.1 }, { defId: 'rope_belt', chance: 0.15 }, { defId: 'potion', chance: 0.2 }, { defId: 'throwing_knife', chance: 0.15 }, { defId: 'bomb', chance: 0.1 }], gold: [5, 20] },
  { id: 'skeleton', name: '骸骨兵', icon: '💀', maxHp: 26, defense: 1, evasion: 0, weapon: { dice: dice(1, 6, 1), cooldown: 1.6, staminaCost: 0 },
    drops: [{ defId: 'short_sword', chance: 0.1 }, { defId: 'leather_cap', chance: 0.15 }, { defId: 'silver_cup', chance: 0.2 }, { defId: 'guard_cloth', chance: 0.1 }], gold: [3, 15] },
  { id: 'ghoul', name: '屍食鬼', icon: '🧟', maxHp: 38, defense: 1, evasion: 0, weapon: { dice: dice(2, 4), cooldown: 2.0, staminaCost: 0 },
    drops: [{ defId: 'leather_armor', chance: 0.15 }, { defId: 'ring_vigor', chance: 0.05 }, { defId: 'gem', chance: 0.15 }], gold: [10, 30] },
  { id: 'troll', name: 'トロル', icon: '🧌', maxHp: 50, defense: 2, evasion: 0, weapon: { dice: dice(2, 6, 2), cooldown: 2.4, staminaCost: 0 },
    drops: [{ defId: 'big_pack', chance: 0.05 }, { defId: 'chain_mail', chance: 0.1 }, { defId: 'gold_idol', chance: 0.15 }], gold: [20, 50] },
];

export const MONSTERS: Readonly<Record<string, MonsterDef>> = Object.fromEntries(DEFS.map((m) => [m.id, m]));
export const MONSTER_IDS: readonly string[] = DEFS.map((m) => m.id);

export function getMonster(id: string): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`unknown monster: ${id}`);
  return m;
}

/** 階ごとの出現リスト（index 0 が地下 1 階） */
const FLOOR_MONSTERS: readonly (readonly string[])[] = [
  ['rat', 'goblin', 'skeleton'],
  ['rat', 'goblin', 'skeleton', 'ghoul'],
  ['rat', 'goblin', 'skeleton', 'ghoul', 'troll'],
];

/** 階ごとの強化（index 0 が地下 1 階）。hp は倍率、damage は武器ダイスの修正値に足す値 */
export const FLOOR_SCALING: readonly { hp: number; damage: number }[] = [
  { hp: 1, damage: 0 },
  { hp: 1, damage: 1 },
  { hp: 1.6, damage: 2 },
];

export function monstersForFloor(floor: number): readonly string[] {
  const list = FLOOR_MONSTERS[floor - 1];
  if (!list) throw new Error(`no monsters for floor ${floor}`);
  return list;
}

/** 階に応じて強化したモンスター（HP・武器ダメージ・落とす金貨） */
export function scaledMonster(m: MonsterDef, floor: number): MonsterDef {
  const scale = FLOOR_SCALING[floor - 1];
  if (!scale) throw new Error(`no scaling for floor ${floor}`);
  if (floor === 1) return m;
  return {
    ...m,
    maxHp: Math.ceil(m.maxHp * scale.hp),
    weapon: { ...m.weapon, dice: { ...m.weapon.dice, bonus: m.weapon.dice.bonus + scale.damage } },
    gold: [m.gold[0] * floor, m.gold[1] * floor],
  };
}
