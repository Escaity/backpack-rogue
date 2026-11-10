import { type Adventurer, createAdventurer } from './equipment';
import { GameError } from './errors';
import { type Grid, createGrid, removeAllGold, removeItem, storeItem } from './grid';
import { type Dest, type Source, moveItem } from './inventory';
import { type ItemInstance, createItem, getDef } from './items';
import { rollShopStock } from './loot';
import { type RaidState, startRaid } from './raid';
import type { Rng } from './rng';

export interface Profile {
  gold: number;
  stash: Grid;
  /** 次の潜入に持ち込む手持ち（装備とバッグ） */
  loadout: Adventurer;
  shop: ItemInstance[];
  raids: number;
}

export class TownError extends GameError {}

export const STASH_START_W = 8;
export const STASH_START_H = 6;
export const STASH_MAX_HEIGHT = 12;

export const FREE_KIT = {
  rightHand: 'rusty_dagger',
  body: 'rag_shirt',
  bag: 'cloth_sack',
  consumable: 'black_bread',
} as const;

export function createProfile(rng: Rng): Profile {
  return {
    gold: 0,
    stash: createGrid(STASH_START_W, STASH_START_H),
    loadout: createAdventurer(),
    shop: rollShopStock(rng),
    raids: 0,
  };
}

export function sellPrice(item: ItemInstance): number {
  return getDef(item.defId).value * item.qty;
}

export function buyPrice(item: ItemInstance): number {
  return Math.max(1, getDef(item.defId).value * 2);
}

export function stashExpandCost(profile: Profile): number {
  return 100 * (profile.stash.h - 5);
}

export function withFreeKit(adventurer: Adventurer): Adventurer {
  const next = structuredClone(adventurer);
  if (!next.equipment.rightHand) next.equipment.rightHand = createItem(FREE_KIT.rightHand);
  if (!next.equipment.body) next.equipment.body = createItem(FREE_KIT.body);
  if (!next.bag) {
    const bag = createItem(FREE_KIT.bag);
    const size = getDef(bag.defId).bagSize!;
    next.bag = bag;
    next.bagGrid = createGrid(size.w, size.h);
  }
  if (!next.consumables[0]) next.consumables[0] = createItem(FREE_KIT.consumable);
  return next;
}

export function buy(profile: Profile, index: number): Profile {
  const item = profile.shop[index];
  if (!item) throw new TownError('その商品はありません');
  const price = buyPrice(item);
  if (profile.gold < price) throw new TownError('金貨が足りません');
  const stash = storeItem(profile.stash, item);
  if (!stash) throw new TownError('倉庫に空きがありません');
  return { ...profile, gold: profile.gold - price, stash, shop: profile.shop.filter((_, i) => i !== index) };
}

export function sellFromStash(profile: Profile, uid: string): Profile {
  const placement = profile.stash.placements.find((p) => p.item.uid === uid);
  if (!placement) throw new TownError('倉庫にないアイテムです');
  return { ...profile, stash: removeItem(profile.stash, uid).grid, gold: profile.gold + sellPrice(placement.item) };
}

export function expandStash(profile: Profile): Profile {
  if (profile.stash.h >= STASH_MAX_HEIGHT) throw new TownError('これ以上拡張できません');
  const cost = stashExpandCost(profile);
  if (profile.gold < cost) throw new TownError('金貨が足りません');
  return { ...profile, gold: profile.gold - cost, stash: { ...profile.stash, h: profile.stash.h + 1 } };
}

export function moveTownItem(profile: Profile, src: Source, dest: Dest): Profile {
  if (dest.kind === 'loot') throw new TownError('拠点では床に置けません');
  const inv = moveItem({ adventurer: profile.loadout, stash: profile.stash, loot: [] }, src, dest);
  return { ...profile, loadout: inv.adventurer, stash: inv.stash ?? profile.stash };
}

/** 手持ちにボロ装備を補って潜入を開始する。拠点の手持ちは空になる（潜入中のリロードはロスト扱い） */
export function beginRaid(profile: Profile, rng: Rng): { profile: Profile; raid: RaidState } {
  const raid = startRaid(withFreeKit(profile.loadout), rng);
  return { profile: { ...profile, loadout: createAdventurer() }, raid };
}

export function finishRaid(profile: Profile, raid: RaidState, rng: Rng): Profile {
  if (raid.status === 'exploring') throw new Error('raid is still in progress');
  const base = { ...profile, raids: profile.raids + 1, shop: rollShopStock(rng) };
  if (raid.status === 'dead') return { ...base, loadout: createAdventurer() };
  const { grid, amount } = removeAllGold(raid.adventurer.bagGrid);
  return { ...base, gold: profile.gold + amount, loadout: { ...raid.adventurer, bagGrid: grid } };
}
