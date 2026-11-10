import { describe, expect, it } from 'vitest';
import { createItem } from '../../src/core/items';
import {
  BASE_STATS, applyWear, canEquip, computeStats, consumableSlotCount, createAdventurer, weaponsOf,
} from '../../src/core/equipment';

describe('equipment', () => {
  it('checks which slot accepts which item', () => {
    expect(canEquip('rightHand', createItem('short_sword'))).toBe(true);
    expect(canEquip('leftHand', createItem('dagger'))).toBe(true);
    expect(canEquip('head', createItem('short_sword'))).toBe(false);
    expect(canEquip('ring1', createItem('ring_guard'))).toBe(true);
    expect(canEquip('ring2', createItem('ring_guard'))).toBe(true);
    expect(canEquip('neck', createItem('gem'))).toBe(false);
  });

  it('belt decides the number of consumable slots', () => {
    expect(consumableSlotCount({})).toBe(1);
    expect(consumableSlotCount({ belt: createItem('rope_belt') })).toBe(2);
    expect(consumableSlotCount({ belt: createItem('leather_belt') })).toBe(3);
  });

  it('sums stat modifiers', () => {
    const s = computeStats({ body: createItem('leather_armor'), head: createItem('leather_cap') });
    expect(s.maxHp).toBe(BASE_STATS.maxHp + 5);
    expect(s.defense).toBe(4);
  });

  it('lists weapons from both hands', () => {
    expect(weaponsOf({ rightHand: createItem('dagger'), leftHand: createItem('short_sword') })).toHaveLength(2);
    expect(weaponsOf({ body: createItem('leather_armor') })).toHaveLength(0);
  });

  it('applyWear reduces durability and breaks items at 0', () => {
    const adv = createAdventurer();
    const worn = { ...createItem('rusty_dagger'), durability: 1 };
    const armor = createItem('leather_armor');
    const ring = createItem('ring_guard');
    const r = applyWear({ ...adv, equipment: { rightHand: worn, body: armor, ring1: ring } });
    expect(r.adventurer.equipment.rightHand).toBeUndefined();
    expect(r.broken.map((b) => b.uid)).toEqual([worn.uid]);
    expect(r.adventurer.equipment.body?.durability).toBe(24);
    expect(r.adventurer.equipment.ring1?.durability).toBeNull();
  });

  it('createAdventurer starts empty with 3 consumable cells', () => {
    const adv = createAdventurer();
    expect(adv.consumables).toEqual([null, null, null]);
    expect(adv.bag).toBeNull();
    expect(adv.bagGrid.w).toBe(0);
  });
});
