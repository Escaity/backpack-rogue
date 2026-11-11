import { GOLD_ID, type ItemInstance, createItem } from './items';
import type { MonsterDef } from './monsters';
import type { Rng } from './rng';

export const CHEST_TABLE: readonly { defId: string; weight: number }[] = [
  { defId: 'potion', weight: 6 }, { defId: 'silver_cup', weight: 6 }, { defId: 'gem', weight: 3 },
  { defId: 'gold_idol', weight: 2 }, { defId: 'old_painting', weight: 2 },
  { defId: 'dagger', weight: 3 }, { defId: 'club', weight: 2 }, { defId: 'short_sword', weight: 2 }, { defId: 'war_axe', weight: 1 },
  { defId: 'leather_cap', weight: 3 }, { defId: 'leather_armor', weight: 2 }, { defId: 'chain_mail', weight: 1 },
  { defId: 'leather_pants', weight: 3 }, { defId: 'boots', weight: 3 }, { defId: 'gloves', weight: 3 }, { defId: 'bracers', weight: 3 },
  { defId: 'rope_belt', weight: 3 }, { defId: 'leather_belt', weight: 1 },
  { defId: 'ring_guard', weight: 1 }, { defId: 'ring_vigor', weight: 1 }, { defId: 'amulet_life', weight: 1 },
  { defId: 'leather_pack', weight: 1 },
  { defId: 'bomb', weight: 5 }, { defId: 'herb', weight: 5 }, { defId: 'throwing_knife', weight: 3 },
  { defId: 'jerky', weight: 3 }, { defId: 'whetstone', weight: 2 }, { defId: 'guard_cloth', weight: 2 },
];

export const SHOP_POOL: readonly string[] = [
  'dagger', 'club', 'short_sword', 'leather_cap', 'leather_armor', 'leather_pants', 'boots', 'gloves',
  'bracers', 'rope_belt', 'leather_belt', 'potion', 'leather_pack',
  'throwing_knife', 'bomb', 'herb', 'jerky',
];

function weightedPick(table: readonly { defId: string; weight: number }[], rng: Rng): string {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const e of table) {
    roll -= e.weight;
    if (roll < 0) return e.defId;
  }
  return table[table.length - 1].defId;
}

export function rollMonsterDrops(monster: MonsterDef, rng: Rng): ItemInstance[] {
  const items = monster.drops.filter((d) => rng.chance(d.chance)).map((d) => createItem(d.defId));
  const gold = rng.int(monster.gold[0], monster.gold[1]);
  if (gold > 0) items.push(createItem(GOLD_ID, gold));
  return items;
}

export function rollChest(rng: Rng): ItemInstance[] {
  const count = rng.int(1, 3);
  const items = Array.from({ length: count }, () => createItem(weightedPick(CHEST_TABLE, rng)));
  items.push(createItem(GOLD_ID, rng.int(5, 40)));
  return items;
}

export function rollShopStock(rng: Rng, count = 6): ItemInstance[] {
  return Array.from({ length: count }, () => createItem(rng.pick(SHOP_POOL)));
}
