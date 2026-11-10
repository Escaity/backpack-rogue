import { describe, expect, it } from 'vitest';
import { type Adventurer, createAdventurer } from '../../src/core/equipment';
import { createGrid, placeItem } from '../../src/core/grid';
import { type Inventory, InventoryError, autoEquip } from '../../src/core/inventory';
import { type ItemInstance, createItem } from '../../src/core/items';

function invWithBag(items: ItemInstance[], adventurer: Partial<Adventurer> = {}): Inventory {
  let bagGrid = createGrid(4, 3);
  items.forEach((item, i) => { bagGrid = placeItem(bagGrid, item, i, 0, 0); });
  return { adventurer: { ...createAdventurer(), bag: createItem('cloth_sack'), bagGrid, ...adventurer }, stash: null, loot: [] };
}

describe('autoEquip', () => {
  it('puts a weapon in the right hand, then the left hand', () => {
    const a = createItem('dagger');
    const b = createItem('dagger');
    let inv = invWithBag([a, b]);
    inv = autoEquip(inv, { kind: 'bag', uid: a.uid });
    inv = autoEquip(inv, { kind: 'bag', uid: b.uid });
    expect(inv.adventurer.equipment.rightHand?.uid).toBe(a.uid);
    expect(inv.adventurer.equipment.leftHand?.uid).toBe(b.uid);
    expect(inv.adventurer.bagGrid.placements).toHaveLength(0);
  });

  it('uses the second ring slot when the first is taken', () => {
    const ring = createItem('ring_guard');
    const inv = autoEquip(invWithBag([ring], { equipment: { ring1: createItem('ring_vigor') } }), { kind: 'bag', uid: ring.uid });
    expect(inv.adventurer.equipment.ring2?.uid).toBe(ring.uid);
  });

  it('swaps with the equipped item and returns the old one to the bag', () => {
    const sword = createItem('short_sword');
    const oldRight = createItem('rusty_dagger');
    const oldLeft = createItem('dagger');
    const inv = autoEquip(invWithBag([sword], { equipment: { rightHand: oldRight, leftHand: oldLeft } }), { kind: 'bag', uid: sword.uid });
    expect(inv.adventurer.equipment.rightHand?.uid).toBe(sword.uid);
    expect(inv.adventurer.equipment.leftHand?.uid).toBe(oldLeft.uid);
    expect(inv.adventurer.bagGrid.placements.map((p) => p.item.uid)).toEqual([oldRight.uid]);
  });

  it('a swap from the floor drops the old item on the floor', () => {
    const armor = createItem('leather_armor');
    const old = createItem('rag_shirt');
    const base = invWithBag([], { equipment: { body: old } });
    const inv = autoEquip({ ...base, loot: [armor] }, { kind: 'loot', uid: armor.uid });
    expect(inv.adventurer.equipment.body?.uid).toBe(armor.uid);
    expect(inv.loot.map((i) => i.uid)).toEqual([old.uid]);
  });

  it('swaps from the stash back into the stash', () => {
    const cap = createItem('leather_cap');
    const old = createItem('leather_cap');
    const inv: Inventory = {
      adventurer: { ...createAdventurer(), equipment: { head: old } },
      stash: placeItem(createGrid(8, 6), cap, 0, 0, 0),
      loot: [],
    };
    const next = autoEquip(inv, { kind: 'stash', uid: cap.uid });
    expect(next.adventurer.equipment.head?.uid).toBe(cap.uid);
    expect(next.stash!.placements.map((p) => p.item.uid)).toEqual([old.uid]);
  });

  it('fails without changes when the old item does not fit back', () => {
    const dagger = createItem('dagger');
    let bagGrid = placeItem(createGrid(2, 2), dagger, 0, 0, 0);
    bagGrid = placeItem(bagGrid, createItem('gem'), 1, 0, 0);
    bagGrid = placeItem(bagGrid, createItem('gem'), 1, 1, 0);
    const sword = createItem('short_sword');
    const inv: Inventory = {
      adventurer: { ...createAdventurer(), bag: createItem('cloth_sack'), bagGrid, equipment: { rightHand: sword, leftHand: createItem('club') } },
      stash: null,
      loot: [],
    };
    expect(() => autoEquip(inv, { kind: 'bag', uid: dagger.uid })).toThrow(InventoryError);
    expect(inv.adventurer.equipment.rightHand?.uid).toBe(sword.uid);
    expect(inv.adventurer.bagGrid.placements).toHaveLength(3);
  });

  it('puts consumables into the first usable consumable slot', () => {
    const potion = createItem('potion');
    const inv = autoEquip(invWithBag([potion], { equipment: { belt: createItem('rope_belt') }, consumables: [createItem('black_bread'), null, null] }), { kind: 'bag', uid: potion.uid });
    expect(inv.adventurer.consumables[1]?.uid).toBe(potion.uid);
  });

  it('rejects consumables when every usable slot is full', () => {
    const potion = createItem('potion');
    expect(() => autoEquip(invWithBag([potion], { consumables: [createItem('black_bread'), null, null] }), { kind: 'bag', uid: potion.uid })).toThrow(InventoryError);
  });

  it('equips a bag item when no bag is worn', () => {
    const pack = createItem('leather_pack');
    const inv: Inventory = { adventurer: createAdventurer(), stash: null, loot: [pack] };
    const next = autoEquip(inv, { kind: 'loot', uid: pack.uid });
    expect(next.adventurer.bag?.uid).toBe(pack.uid);
  });

  it('rejects items that cannot be equipped', () => {
    const gem = createItem('gem');
    expect(() => autoEquip(invWithBag([gem]), { kind: 'bag', uid: gem.uid })).toThrow(InventoryError);
  });
});
