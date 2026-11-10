import { type Dice, dice } from './dice';

export type Cell = readonly [number, number];
export type Rotation = 0 | 1 | 2 | 3;
export type ItemSlot = 'weapon' | 'head' | 'body' | 'belt' | 'legs' | 'feet' | 'hands' | 'arms' | 'ring' | 'neck';
export type ItemKind = 'equipment' | 'consumable' | 'treasure' | 'gold' | 'bag';

export interface StatMods {
  maxHp?: number;
  defense?: number;
  /** 0〜1 の回避率を加算 */
  evasion?: number;
  /** 攻撃速度倍率に加算（0.1 = +10%） */
  attackSpeed?: number;
  maxStamina?: number;
}

export interface WeaponStats {
  dice: Dice;
  /** 秒 */
  cooldown: number;
  staminaCost: number;
}

export interface PeriodicHeal {
  every: number;
  heal: number;
}

export interface ConsumableEffect {
  /** HP 割合がこの値未満になったら発動 */
  hpBelow: number;
  heal: number;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  shape: readonly Cell[];
  /** 売値（1個あたり） */
  value: number;
  slot?: ItemSlot;
  mods?: StatMods;
  weapon?: WeaponStats;
  periodicHeal?: PeriodicHeal;
  consumable?: ConsumableEffect;
  /** ベルトが提供する消費アイテム枠の数 */
  consumableSlots?: number;
  bagSize?: { w: number; h: number };
  maxDurability?: number;
  stackMax?: number;
}

export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
  durability: number | null;
}

export const GOLD_ID = 'gold';

export function rect(w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
  return cells;
}

const L_SHAPE: Cell[] = [[0, 0], [1, 0], [0, 1], [0, 2]];

const DEFS: ItemDef[] = [
  // 武器
  { id: 'rusty_dagger', name: '錆びた短剣', icon: '🔪', kind: 'equipment', slot: 'weapon', shape: rect(1, 2), value: 0, weapon: { dice: dice(1, 4, 2), cooldown: 1.2, staminaCost: 1 }, maxDurability: 10 },
  { id: 'dagger', name: '短剣', icon: '🗡️', kind: 'equipment', slot: 'weapon', shape: rect(1, 2), value: 15, weapon: { dice: dice(1, 6, 1), cooldown: 1.0, staminaCost: 1 }, maxDurability: 20 },
  { id: 'club', name: '棍棒', icon: '🏏', kind: 'equipment', slot: 'weapon', shape: rect(1, 3), value: 10, weapon: { dice: dice(1, 8, 1), cooldown: 1.6, staminaCost: 2 }, maxDurability: 15 },
  { id: 'short_sword', name: 'ショートソード', icon: '⚔️', kind: 'equipment', slot: 'weapon', shape: rect(1, 3), value: 30, weapon: { dice: dice(1, 8, 2), cooldown: 1.4, staminaCost: 2 }, maxDurability: 25 },
  { id: 'war_axe', name: '戦斧', icon: '🪓', kind: 'equipment', slot: 'weapon', shape: L_SHAPE, value: 45, weapon: { dice: dice(2, 6, 3), cooldown: 2.2, staminaCost: 3 }, maxDurability: 25 },
  // 防具
  { id: 'rag_shirt', name: 'ボロ布の服', icon: '👕', kind: 'equipment', slot: 'body', shape: rect(2, 2), value: 0, mods: { defense: 1 }, maxDurability: 10 },
  { id: 'leather_armor', name: '革鎧', icon: '🦺', kind: 'equipment', slot: 'body', shape: rect(2, 2), value: 35, mods: { defense: 3 }, maxDurability: 25 },
  { id: 'chain_mail', name: '鎖帷子', icon: '🥋', kind: 'equipment', slot: 'body', shape: rect(2, 3), value: 60, mods: { defense: 5, maxHp: 10 }, maxDurability: 30 },
  { id: 'leather_cap', name: '革の帽子', icon: '🧢', kind: 'equipment', slot: 'head', shape: rect(2, 1), value: 12, mods: { defense: 1, maxHp: 5 }, maxDurability: 20 },
  { id: 'leather_pants', name: '革のズボン', icon: '👖', kind: 'equipment', slot: 'legs', shape: rect(2, 2), value: 20, mods: { defense: 2 }, maxDurability: 20 },
  { id: 'boots', name: '旅人の靴', icon: '🥾', kind: 'equipment', slot: 'feet', shape: rect(2, 1), value: 18, mods: { evasion: 0.05 }, maxDurability: 20 },
  { id: 'gloves', name: '革手袋', icon: '🧤', kind: 'equipment', slot: 'hands', shape: rect(2, 1), value: 15, mods: { attackSpeed: 0.1 }, maxDurability: 20 },
  { id: 'bracers', name: '革の腕当て', icon: '🦾', kind: 'equipment', slot: 'arms', shape: rect(2, 1), value: 15, mods: { defense: 1, attackSpeed: 0.05 }, maxDurability: 20 },
  { id: 'rope_belt', name: '布の帯', icon: '🎗️', kind: 'equipment', slot: 'belt', shape: rect(2, 1), value: 5, consumableSlots: 2, maxDurability: 20 },
  { id: 'leather_belt', name: '革のベルト', icon: '🪢', kind: 'equipment', slot: 'belt', shape: rect(2, 1), value: 25, consumableSlots: 3, maxDurability: 25 },
  // 装飾品（耐久度なし）
  { id: 'ring_vigor', name: '活力の指輪', icon: '💍', kind: 'equipment', slot: 'ring', shape: rect(1, 1), value: 40, periodicHeal: { every: 5, heal: 2 } },
  { id: 'ring_guard', name: '守りの指輪', icon: '💍', kind: 'equipment', slot: 'ring', shape: rect(1, 1), value: 40, mods: { defense: 1 } },
  { id: 'amulet_life', name: '生命のアミュレット', icon: '📿', kind: 'equipment', slot: 'neck', shape: rect(1, 1), value: 50, mods: { maxHp: 15 } },
  // 消費アイテム
  { id: 'black_bread', name: '黒パン', icon: '🍞', kind: 'consumable', shape: rect(1, 1), value: 0, consumable: { hpBelow: 0.5, heal: 8 } },
  { id: 'potion', name: '回復ポーション', icon: '🧪', kind: 'consumable', shape: rect(1, 1), value: 20, consumable: { hpBelow: 0.5, heal: 20 } },
  // 宝物
  { id: 'silver_cup', name: '銀の杯', icon: '🏆', kind: 'treasure', shape: rect(1, 1), value: 30 },
  { id: 'gem', name: 'ルビー', icon: '💎', kind: 'treasure', shape: rect(1, 1), value: 60 },
  { id: 'gold_idol', name: '金の像', icon: '🗿', kind: 'treasure', shape: rect(2, 2), value: 120 },
  { id: 'old_painting', name: '古い絵画', icon: '🖼️', kind: 'treasure', shape: rect(3, 2), value: 90 },
  // 金貨
  { id: GOLD_ID, name: '金貨', icon: '🪙', kind: 'gold', shape: rect(1, 1), value: 1, stackMax: 50 },
  // バッグ
  { id: 'cloth_sack', name: '布袋', icon: '👝', kind: 'bag', shape: rect(2, 2), value: 0, bagSize: { w: 4, h: 3 } },
  { id: 'leather_pack', name: '革の背嚢', icon: '🎒', kind: 'bag', shape: rect(2, 3), value: 40, bagSize: { w: 5, h: 4 } },
  { id: 'big_pack', name: '冒険者の大鞄', icon: '🧳', kind: 'bag', shape: rect(3, 3), value: 100, bagSize: { w: 6, h: 5 } },
];

export const ITEM_DEFS: Readonly<Record<string, ItemDef>> = Object.fromEntries(DEFS.map((d) => [d.id, d]));

export function getDef(defId: string): ItemDef {
  const def = ITEM_DEFS[defId];
  if (!def) throw new Error(`unknown item: ${defId}`);
  return def;
}

/** 一意な ID。非セキュアコンテキストでは crypto.randomUUID が無いので getRandomValues で代用する */
export function newUid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function createItem(defId: string, qty = 1): ItemInstance {
  const def = getDef(defId);
  return { uid: newUid(), defId, qty, durability: def.maxDurability ?? null };
}

/** 時計回りに rot×90° 回転し、左上が (0,0) になるよう平行移動した形状を返す（y→x の順にソート済み） */
export function rotateShape(shape: readonly Cell[], rot: Rotation): Cell[] {
  let cells: [number, number][] = shape.map(([x, y]) => [x, y]);
  for (let i = 0; i < rot; i++) cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]): Cell => [x - minX + 0, y - minY + 0])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
