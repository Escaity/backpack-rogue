import { GameError } from './errors';
import { type Adventurer, type EquipSlotId, canEquip, consumableSlotCount } from './equipment';
import { type Grid, canPlace, createGrid, placeItem, removeItem, storeItem, storePartial } from './grid';
import { type ItemInstance, type Rotation, getDef } from './items';

export type Source =
  | { kind: 'stash' | 'bag' | 'loot'; uid: string }
  | { kind: 'equip'; slot: EquipSlotId }
  | { kind: 'consumable'; index: number }
  | { kind: 'bagSlot' };

export type Dest =
  | { kind: 'stash' | 'bag'; x: number; y: number; rot: Rotation }
  | { kind: 'equip'; slot: EquipSlotId }
  | { kind: 'consumable'; index: number }
  | { kind: 'bagSlot' }
  | { kind: 'loot' }
  | { kind: 'discard' };

export interface Inventory {
  adventurer: Adventurer;
  /** 潜入中は null */
  stash: Grid | null;
  /** 潜入中は今いる部屋の床。拠点では常に空 */
  loot: ItemInstance[];
}

export class InventoryError extends GameError {}

export function moveItem(inv: Inventory, src: Source, dest: Dest): Inventory {
  const taken = take(inv, src);
  return put(taken.inv, dest, taken.item);
}

export function autoStore(inv: Inventory, src: Source, target: 'bag' | 'stash'): Inventory {
  const taken = take(inv, src);
  const rest = taken.inv;
  const grid = target === 'bag' ? rest.adventurer.bagGrid : requireStash(rest);
  const full = new InventoryError(target === 'bag' ? 'バッグに空きがありません' : '倉庫に空きがありません');
  let stored: Grid;
  let leftover: ItemInstance | null = null;
  if (src.kind === 'loot') {
    // 床から拾うときは入る分だけ拾い、残りは床に残す（金貨の山など）
    const r = storePartial(grid, taken.item);
    if (r.leftover && r.leftover.qty === taken.item.qty) throw full;
    stored = r.grid;
    leftover = r.leftover;
  } else {
    const all = storeItem(grid, taken.item);
    if (!all) throw full;
    stored = all;
  }
  const next: Inventory = target === 'bag'
    ? { ...rest, adventurer: { ...rest.adventurer, bagGrid: stored } }
    : { ...rest, stash: stored };
  return leftover ? { ...next, loot: [...next.loot, leftover] } : next;
}

const SLOT_CANDIDATES: Readonly<Record<string, readonly EquipSlotId[]>> = {
  weapon: ['rightHand', 'leftHand'],
  ring: ['ring1', 'ring2'],
};

/**
 * アイテムを適切な枠に自動で装備する。空き枠があればそこへ、なければ先頭の候補枠と入れ替え、
 * 外した装備は取り出し元（バッグ・倉庫・床）に戻す。戻せなければ何も変えずにエラー。
 */
export function autoEquip(inv: Inventory, src: Source): Inventory {
  const item = peek(inv, src);
  const def = getDef(item.defId);
  const adv = inv.adventurer;

  if (def.kind === 'consumable') {
    const count = consumableSlotCount(adv.equipment);
    const index = adv.consumables.findIndex((c, i) => i < count && c === null);
    if (index < 0) throw new InventoryError('空いている消費アイテム枠がありません');
    return moveItem(inv, src, { kind: 'consumable', index });
  }
  if (def.kind === 'bag') {
    if (adv.bag) throw new InventoryError('バッグの入れ替えは、今のバッグを空にして外してから行ってください');
    return moveItem(inv, src, { kind: 'bagSlot' });
  }
  if (def.kind !== 'equipment' || !def.slot) throw new InventoryError('このアイテムは装備できません');

  const candidates = SLOT_CANDIDATES[def.slot] ?? [def.slot as EquipSlotId];
  const empty = candidates.find((slot) => !adv.equipment[slot]);
  if (empty) return moveItem(inv, src, { kind: 'equip', slot: empty });

  // 入れ替え: 新しい装備を取り出し、古い装備を外して取り出し元へ戻してから装備する
  const slot = candidates[0];
  const taken = take(inv, src);
  const removed = take(taken.inv, { kind: 'equip', slot });
  const returned = returnTo(removed.inv, src, removed.item);
  return put(returned, { kind: 'equip', slot }, taken.item);
}

function peek(inv: Inventory, src: Source): ItemInstance {
  return take(inv, src).item;
}

function returnTo(inv: Inventory, src: Source, item: ItemInstance): Inventory {
  switch (src.kind) {
    case 'loot':
      return { ...inv, loot: [...inv.loot, item] };
    case 'stash': {
      const stash = storeItem(requireStash(inv), item);
      if (!stash) throw new InventoryError('倉庫に空きがないため入れ替えられません');
      return { ...inv, stash };
    }
    case 'bag': {
      const bagGrid = storeItem(inv.adventurer.bagGrid, item);
      if (!bagGrid) throw new InventoryError('バッグに空きがないため入れ替えられません');
      return { ...inv, adventurer: { ...inv.adventurer, bagGrid } };
    }
    default:
      throw new InventoryError('装備中のアイテムは入れ替えられません');
  }
}

function requireStash(inv: Inventory): Grid {
  if (!inv.stash) throw new InventoryError('ここでは倉庫を使えません');
  return inv.stash;
}

function removeFrom(grid: Grid, uid: string): { grid: Grid; item: ItemInstance } {
  if (!grid.placements.some((p) => p.item.uid === uid)) throw new InventoryError('そのアイテムは見つかりません');
  return removeItem(grid, uid);
}

function take(inv: Inventory, src: Source): { inv: Inventory; item: ItemInstance } {
  const adv = inv.adventurer;
  switch (src.kind) {
    case 'stash': {
      const r = removeFrom(requireStash(inv), src.uid);
      return { inv: { ...inv, stash: r.grid }, item: r.item };
    }
    case 'bag': {
      const r = removeFrom(adv.bagGrid, src.uid);
      return { inv: { ...inv, adventurer: { ...adv, bagGrid: r.grid } }, item: r.item };
    }
    case 'loot': {
      const item = inv.loot.find((i) => i.uid === src.uid);
      if (!item) throw new InventoryError('そのアイテムは見つかりません');
      return { inv: { ...inv, loot: inv.loot.filter((i) => i.uid !== src.uid) }, item };
    }
    case 'equip': {
      const item = adv.equipment[src.slot];
      if (!item) throw new InventoryError('その枠は空です');
      if (src.slot === 'belt' && adv.consumables.slice(1).some((c) => c !== null)) {
        throw new InventoryError('ベルトを外す前に2番目以降の消費アイテム枠を空けてください');
      }
      const equipment = { ...adv.equipment };
      delete equipment[src.slot];
      return { inv: { ...inv, adventurer: { ...adv, equipment } }, item };
    }
    case 'consumable': {
      const item = adv.consumables[src.index] ?? null;
      if (!item) throw new InventoryError('その枠は空です');
      const consumables = adv.consumables.map((c, i) => (i === src.index ? null : c));
      return { inv: { ...inv, adventurer: { ...adv, consumables } }, item };
    }
    case 'bagSlot': {
      if (!adv.bag) throw new InventoryError('バッグを装備していません');
      if (adv.bagGrid.placements.length > 0) throw new InventoryError('バッグを空にしてから外してください');
      return { inv: { ...inv, adventurer: { ...adv, bag: null, bagGrid: createGrid(0, 0) } }, item: adv.bag };
    }
  }
}

function put(inv: Inventory, dest: Dest, item: ItemInstance): Inventory {
  const adv = inv.adventurer;
  const def = getDef(item.defId);
  switch (dest.kind) {
    case 'stash': {
      const grid = requireStash(inv);
      if (!canPlace(grid, item, dest.x, dest.y, dest.rot)) throw new InventoryError('そこには置けません');
      return { ...inv, stash: placeItem(grid, item, dest.x, dest.y, dest.rot) };
    }
    case 'bag': {
      if (!canPlace(adv.bagGrid, item, dest.x, dest.y, dest.rot)) throw new InventoryError('そこには置けません');
      return { ...inv, adventurer: { ...adv, bagGrid: placeItem(adv.bagGrid, item, dest.x, dest.y, dest.rot) } };
    }
    case 'loot':
      return { ...inv, loot: [...inv.loot, item] };
    case 'discard':
      return inv;
    case 'equip': {
      if (!canEquip(dest.slot, item)) throw new InventoryError('その枠には装備できません');
      if (adv.equipment[dest.slot]) throw new InventoryError('その枠は使用中です（先に外してください）');
      return { ...inv, adventurer: { ...adv, equipment: { ...adv.equipment, [dest.slot]: item } } };
    }
    case 'consumable': {
      if (def.kind !== 'consumable') throw new InventoryError('消費アイテムではありません');
      if (dest.index >= consumableSlotCount(adv.equipment)) throw new InventoryError('その消費アイテム枠は使えません（ベルトが必要）');
      if (adv.consumables[dest.index]) throw new InventoryError('その枠は使用中です');
      return { ...inv, adventurer: { ...adv, consumables: adv.consumables.map((c, i) => (i === dest.index ? item : c)) } };
    }
    case 'bagSlot': {
      if (def.kind !== 'bag' || !def.bagSize) throw new InventoryError('バッグではありません');
      if (adv.bag) throw new InventoryError('すでにバッグを装備しています');
      return { ...inv, adventurer: { ...adv, bag: item, bagGrid: createGrid(def.bagSize.w, def.bagSize.h) } };
    }
  }
}
