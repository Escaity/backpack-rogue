import { type Grid, createGrid } from './grid';
import { type ItemInstance, type ItemSlot, type WeaponStats, getDef } from './items';

export type EquipSlotId =
  | 'rightHand' | 'leftHand' | 'head' | 'body' | 'belt' | 'legs' | 'feet' | 'hands' | 'arms' | 'ring1' | 'ring2' | 'neck';

export const EQUIP_SLOTS: readonly EquipSlotId[] = [
  'head', 'ring1', 'neck', 'ring2', 'rightHand', 'arms', 'body', 'hands', 'leftHand', 'belt', 'legs', 'feet',
];

export const SLOT_LABELS: Readonly<Record<EquipSlotId, string>> = {
  rightHand: '右手', leftHand: '左手', head: '頭部', body: '胴体', belt: 'ベルト', legs: '脚部',
  feet: '靴', hands: '手袋', arms: '腕', ring1: '指輪R', ring2: '指輪L', neck: 'ネックレス',
};

const SLOT_ACCEPTS: Readonly<Record<EquipSlotId, ItemSlot>> = {
  rightHand: 'weapon', leftHand: 'weapon', head: 'head', body: 'body', belt: 'belt', legs: 'legs',
  feet: 'feet', hands: 'hands', arms: 'arms', ring1: 'ring', ring2: 'ring', neck: 'neck',
};

export const MAX_CONSUMABLE_SLOTS = 3;

export type Equipment = Partial<Record<EquipSlotId, ItemInstance>>;

export interface Adventurer {
  equipment: Equipment;
  /** 常に長さ 3。使えるのは先頭から consumableSlotCount 個 */
  consumables: (ItemInstance | null)[];
  bag: ItemInstance | null;
  bagGrid: Grid;
  /** 潜入中の現在 HP（拠点では使わない） */
  hp: number;
}

export interface Stats {
  maxHp: number;
  defense: number;
  evasion: number;
  attackSpeed: number;
  maxStamina: number;
  staminaRegen: number;
}

export const BASE_STATS: Readonly<Stats> = {
  maxHp: 50, defense: 0, evasion: 0, attackSpeed: 1, maxStamina: 10, staminaRegen: 2,
};

export function createAdventurer(): Adventurer {
  return { equipment: {}, consumables: [null, null, null], bag: null, bagGrid: createGrid(0, 0), hp: 0 };
}

export function canEquip(slot: EquipSlotId, item: ItemInstance): boolean {
  const def = getDef(item.defId);
  return def.kind === 'equipment' && def.slot === SLOT_ACCEPTS[slot];
}

export function consumableSlotCount(equipment: Equipment): number {
  const belt = equipment.belt;
  return belt ? (getDef(belt.defId).consumableSlots ?? 1) : 1;
}

export function computeStats(equipment: Equipment): Stats {
  const stats: Stats = { ...BASE_STATS };
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const mods = getDef(item.defId).mods;
    if (!mods) continue;
    stats.maxHp += mods.maxHp ?? 0;
    stats.defense += mods.defense ?? 0;
    stats.evasion += mods.evasion ?? 0;
    stats.attackSpeed += mods.attackSpeed ?? 0;
    stats.maxStamina += mods.maxStamina ?? 0;
  }
  return stats;
}

export function weaponsOf(equipment: Equipment): WeaponStats[] {
  return (['rightHand', 'leftHand'] as const).flatMap((slot) => {
    const item = equipment[slot];
    const weapon = item ? getDef(item.defId).weapon : undefined;
    return weapon ? [weapon] : [];
  });
}

/** 戦闘1回分の消耗。耐久度が 0 になった装備は外れて broken に入る */
export function applyWear(adventurer: Adventurer): { adventurer: Adventurer; broken: ItemInstance[] } {
  const equipment: Equipment = {};
  const broken: ItemInstance[] = [];
  for (const slot of EQUIP_SLOTS) {
    const item = adventurer.equipment[slot];
    if (!item) continue;
    if (item.durability === null) {
      equipment[slot] = item;
      continue;
    }
    const durability = item.durability - 1;
    if (durability <= 0) broken.push({ ...item, durability: 0 });
    else equipment[slot] = { ...item, durability };
  }
  return { adventurer: { ...adventurer, equipment }, broken };
}
