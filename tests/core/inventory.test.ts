import { describe, expect, it } from 'vitest';
import { type Adventurer, createAdventurer } from '../../src/core/equipment';
import { createGrid, findItemAt, placeItem } from '../../src/core/grid';
import { type Inventory, InventoryError, autoStore, moveItem } from '../../src/core/inventory';
import { createItem } from '../../src/core/items';

function makeInv(): Inventory {
  const adventurer: Adventurer = { ...createAdventurer(), bag: createItem('cloth_sack'), bagGrid: createGrid(4, 3) };
  return { adventurer, stash: createGrid(8, 6), loot: [] };
}

describe('inventory', () => {
  it('moves an item from stash to bag', () => {
    const sword = createItem('short_sword');
    const inv = { ...makeInv(), stash: placeItem(createGrid(8, 6), sword, 0, 0, 0) };
    const next = moveItem(inv, { kind: 'stash', uid: sword.uid }, { kind: 'bag', x: 3, y: 0, rot: 0 });
    expect(next.stash!.placements).toHaveLength(0);
    expect(findItemAt(next.adventurer.bagGrid, 3, 2)?.item.uid).toBe(sword.uid);
  });

  it('equips a weapon and rejects wrong slots', () => {
    const sword = createItem('short_sword');
    const inv = { ...makeInv(), loot: [sword] };
    const next = moveItem(inv, { kind: 'loot', uid: sword.uid }, { kind: 'equip', slot: 'rightHand' });
    expect(next.adventurer.equipment.rightHand?.uid).toBe(sword.uid);
    expect(() => moveItem(inv, { kind: 'loot', uid: sword.uid }, { kind: 'equip', slot: 'head' })).toThrow(InventoryError);
  });

  it('rejects equipping into an occupied slot', () => {
    const a = createItem('dagger');
    const b = createItem('dagger');
    const base = makeInv();
    const inv = { ...base, adventurer: { ...base.adventurer, equipment: { rightHand: a } }, loot: [b] };
    expect(() => moveItem(inv, { kind: 'loot', uid: b.uid }, { kind: 'equip', slot: 'rightHand' })).toThrow(InventoryError);
  });

  it('only allows consumable cells enabled by the belt', () => {
    const potion = createItem('potion');
    const inv = { ...makeInv(), loot: [potion] };
    expect(() => moveItem(inv, { kind: 'loot', uid: potion.uid }, { kind: 'consumable', index: 1 })).toThrow(InventoryError);
    const belted = { ...inv, adventurer: { ...inv.adventurer, equipment: { belt: createItem('rope_belt') } } };
    const next = moveItem(belted, { kind: 'loot', uid: potion.uid }, { kind: 'consumable', index: 1 });
    expect(next.adventurer.consumables[1]?.uid).toBe(potion.uid);
  });

  it('rejects non-consumables in consumable cells', () => {
    const gem = createItem('gem');
    expect(() => moveItem({ ...makeInv(), loot: [gem] }, { kind: 'loot', uid: gem.uid }, { kind: 'consumable', index: 0 })).toThrow(InventoryError);
  });

  it('blocks removing the belt while extra consumable cells are used', () => {
    const base = makeInv();
    const inv: Inventory = {
      ...base,
      adventurer: { ...base.adventurer, equipment: { belt: createItem('rope_belt') }, consumables: [null, createItem('potion'), null] },
    };
    expect(() => moveItem(inv, { kind: 'equip', slot: 'belt' }, { kind: 'loot' })).toThrow(InventoryError);
  });

  it('equips a bag and resizes the bag grid', () => {
    const pack = createItem('leather_pack');
    const base = makeInv();
    const inv: Inventory = { ...base, adventurer: { ...base.adventurer, bag: null, bagGrid: createGrid(0, 0) }, loot: [pack] };
    const next = moveItem(inv, { kind: 'loot', uid: pack.uid }, { kind: 'bagSlot' });
    expect(next.adventurer.bag?.uid).toBe(pack.uid);
    expect([next.adventurer.bagGrid.w, next.adventurer.bagGrid.h]).toEqual([5, 4]);
  });

  it('refuses to unequip a bag that still has items', () => {
    const base = makeInv();
    const inv: Inventory = { ...base, adventurer: { ...base.adventurer, bagGrid: placeItem(createGrid(4, 3), createItem('gem'), 0, 0, 0) } };
    expect(() => moveItem(inv, { kind: 'bagSlot' }, { kind: 'loot' })).toThrow(InventoryError);
  });

  it('leaves the original inventory untouched when a move fails', () => {
    const gem = createItem('gem');
    const inv = { ...makeInv(), loot: [gem] };
    expect(() => moveItem(inv, { kind: 'loot', uid: gem.uid }, { kind: 'bag', x: 10, y: 10, rot: 0 })).toThrow(InventoryError);
    expect(inv.loot).toHaveLength(1);
  });

  it('autoStore puts loot into the bag and fails when full', () => {
    const gem = createItem('gem');
    const next = autoStore({ ...makeInv(), loot: [gem] }, { kind: 'loot', uid: gem.uid }, 'bag');
    expect(next.loot).toHaveLength(0);
    expect(next.adventurer.bagGrid.placements).toHaveLength(1);
    const painting = createItem('old_painting');
    const base = makeInv();
    const tiny: Inventory = { ...base, adventurer: { ...base.adventurer, bagGrid: createGrid(1, 1) }, loot: [painting] };
    expect(() => autoStore(tiny, { kind: 'loot', uid: painting.uid }, 'bag')).toThrow(InventoryError);
  });

  it('discard removes the item', () => {
    const gem = createItem('gem');
    const next = moveItem({ ...makeInv(), loot: [gem] }, { kind: 'loot', uid: gem.uid }, { kind: 'discard' });
    expect(next.loot).toHaveLength(0);
  });
});
