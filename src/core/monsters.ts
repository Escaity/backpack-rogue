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
  { id: 'rat', name: '大ネズミ', icon: '🐀', maxHp: 15, defense: 0, evasion: 0.1, weapon: { damage: 2, cooldown: 1.0, staminaCost: 0 },
    drops: [{ defId: 'black_bread', chance: 0.3 }], gold: [0, 5] },
  { id: 'goblin', name: 'ゴブリン', icon: '👺', maxHp: 25, defense: 0, evasion: 0.15, weapon: { damage: 4, cooldown: 1.2, staminaCost: 0 },
    drops: [{ defId: 'dagger', chance: 0.2 }, { defId: 'gloves', chance: 0.1 }, { defId: 'rope_belt', chance: 0.15 }, { defId: 'potion', chance: 0.2 }], gold: [5, 20] },
  { id: 'skeleton', name: '骸骨兵', icon: '💀', maxHp: 30, defense: 1, evasion: 0, weapon: { damage: 5, cooldown: 1.6, staminaCost: 0 },
    drops: [{ defId: 'short_sword', chance: 0.1 }, { defId: 'leather_cap', chance: 0.15 }, { defId: 'silver_cup', chance: 0.2 }], gold: [3, 15] },
  { id: 'ghoul', name: '屍食鬼', icon: '🧟', maxHp: 38, defense: 1, evasion: 0, weapon: { damage: 6, cooldown: 2.0, staminaCost: 0 },
    drops: [{ defId: 'leather_armor', chance: 0.15 }, { defId: 'ring_vigor', chance: 0.05 }, { defId: 'gem', chance: 0.15 }], gold: [10, 30] },
];

export const MONSTERS: Readonly<Record<string, MonsterDef>> = Object.fromEntries(DEFS.map((m) => [m.id, m]));
export const MONSTER_IDS: readonly string[] = DEFS.map((m) => m.id);

export function getMonster(id: string): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`unknown monster: ${id}`);
  return m;
}
