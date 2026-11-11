import { describe, expect, it } from 'vitest';
import { CHEST_TABLE, SHOP_POOL, rollChest, rollMonsterDrops, rollShopStock } from '../../src/core/loot';
import { MONSTERS, MONSTER_IDS, getMonster } from '../../src/core/monsters';
import { getDef } from '../../src/core/items';
import { createRng } from '../../src/core/rng';

describe('monsters and loot', () => {
  it('every referenced item id exists', () => {
    for (const m of Object.values(MONSTERS)) for (const d of m.drops) expect(() => getDef(d.defId)).not.toThrow();
    for (const e of CHEST_TABLE) expect(() => getDef(e.defId)).not.toThrow();
    for (const id of SHOP_POOL) expect(() => getDef(id)).not.toThrow();
  });

  it('getMonster throws for unknown ids', () => {
    expect(() => getMonster('dragon')).toThrow();
    expect(MONSTER_IDS.length).toBeGreaterThan(0);
  });

  it('monster drops are deterministic and gold stays in range', () => {
    const m = getMonster('goblin');
    const a = rollMonsterDrops(m, createRng(9)).map((i) => [i.defId, i.qty]);
    const b = rollMonsterDrops(m, createRng(9)).map((i) => [i.defId, i.qty]);
    expect(a).toEqual(b);
    for (let seed = 0; seed < 50; seed++) {
      const gold = rollMonsterDrops(m, createRng(seed)).find((i) => i.defId === 'gold');
      if (gold) {
        expect(gold.qty).toBeGreaterThanOrEqual(m.gold[0]);
        expect(gold.qty).toBeLessThanOrEqual(m.gold[1]);
      }
    }
  });

  it('chests contain 1-3 items plus gold', () => {
    for (let seed = 0; seed < 30; seed++) {
      const items = rollChest(createRng(seed));
      const nonGold = items.filter((i) => i.defId !== 'gold');
      expect(nonGold.length).toBeGreaterThanOrEqual(1);
      expect(nonGold.length).toBeLessThanOrEqual(3);
      expect(items.some((i) => i.defId === 'gold')).toBe(true);
    }
  });

  it('deeper chests hold more items and gold', () => {
    for (let seed = 0; seed < 30; seed++) {
      const items = rollChest(createRng(seed), 3);
      const nonGold = items.filter((i) => i.defId !== 'gold');
      expect(nonGold.length).toBeGreaterThanOrEqual(3);
      expect(nonGold.length).toBeLessThanOrEqual(5);
      const gold = items.find((i) => i.defId === 'gold')!;
      expect(gold.qty).toBeGreaterThanOrEqual(15);
      expect(gold.qty).toBeLessThanOrEqual(120);
    }
  });

  it('floor 3 chests favour treasure', () => {
    const share = (floor: number) => {
      let treasure = 0;
      let total = 0;
      for (let seed = 0; seed < 300; seed++) {
        for (const item of rollChest(createRng(seed), floor)) {
          if (item.defId === 'gold') continue;
          total++;
          if (getDef(item.defId).kind === 'treasure') treasure++;
        }
      }
      return treasure / total;
    };
    expect(share(3)).toBeGreaterThan(share(2) * 1.4);
  });

  it('shop stock comes from the shop pool', () => {
    const stock = rollShopStock(createRng(4));
    expect(stock).toHaveLength(6);
    for (const item of stock) expect(SHOP_POOL).toContain(item.defId);
  });
});
