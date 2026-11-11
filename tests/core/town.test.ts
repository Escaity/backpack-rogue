import { describe, expect, it } from 'vitest';
import { createAdventurer } from '../../src/core/equipment';
import { countGold, createGrid, placeItem, storeItem } from '../../src/core/grid';
import { createItem } from '../../src/core/items';
import type { RaidState } from '../../src/core/raid';
import { createRng } from '../../src/core/rng';
import {
  TownError, beginRaid, buy, buyPrice, createProfile, expandStash, finishRaid, moveTownItem, sellFromStash, withFreeKit,
} from '../../src/core/town';

describe('town', () => {
  it('creates an empty profile with a shop', () => {
    const p = createProfile(createRng(1));
    expect(p.gold).toBe(0);
    expect([p.stash.w, p.stash.h]).toEqual([8, 6]);
    expect(p.shop).toHaveLength(6);
    expect(p.raids).toBe(0);
  });

  it('free kit fills only empty slots', () => {
    const sword = createItem('short_sword');
    const kit = withFreeKit({ ...createAdventurer(), equipment: { rightHand: sword } });
    expect(kit.equipment.rightHand?.uid).toBe(sword.uid);
    expect(kit.equipment.body?.defId).toBe('rag_shirt');
    expect(kit.bag?.defId).toBe('cloth_sack');
    expect([kit.bagGrid.w, kit.bagGrid.h]).toEqual([4, 3]);
    expect(kit.consumables[0]?.defId).toBe('black_bread');
  });

  it('free kit adds an old knife when the bag has no tools', () => {
    const kit = withFreeKit(createAdventurer());
    expect(kit.bagGrid.placements.map((p) => p.item.defId)).toEqual(['old_knife']);
  });

  it('free kit does not add a knife when the bag already has a tool', () => {
    const base = withFreeKit(createAdventurer());
    const bomb = createItem('bomb');
    const withBomb = { ...base, bagGrid: placeItem(createGrid(4, 3), bomb, 0, 0, 0) };
    expect(withFreeKit(withBomb).bagGrid.placements.map((p) => p.item.defId)).toEqual(['bomb']);
  });

  it('free kit gives no knife when the stash already holds an old knife', () => {
    const stash = placeItem(createGrid(8, 6), createItem('old_knife'), 0, 0, 0);
    const kit = withFreeKit(createAdventurer(), stash);
    expect(kit.bagGrid.placements).toHaveLength(0);
  });

  it('free kit still gives a knife with an empty stash', () => {
    const kit = withFreeKit(createAdventurer(), createGrid(8, 6));
    expect(kit.bagGrid.placements.map((p) => p.item.defId)).toEqual(['old_knife']);
  });

  it('buying needs enough gold and stash space', () => {
    const p = createProfile(createRng(1));
    expect(() => buy(p, 0)).toThrow(TownError);
    const rich = { ...p, gold: 1000 };
    const price = buyPrice(rich.shop[0]);
    const after = buy(rich, 0);
    expect(after.gold).toBe(1000 - price);
    expect(after.stash.placements).toHaveLength(1);
    expect(after.shop).toHaveLength(5);
  });

  it('selling adds the item value', () => {
    const gem = createItem('gem');
    const p = { ...createProfile(createRng(1)), stash: placeItem(createProfile(createRng(1)).stash, gem, 0, 0, 0) };
    const after = sellFromStash(p, gem.uid);
    expect(after.gold).toBe(60);
    expect(after.stash.placements).toHaveLength(0);
  });

  it('expanding the stash costs gold', () => {
    const p = { ...createProfile(createRng(1)), gold: 100 };
    const after = expandStash(p);
    expect(after.stash.h).toBe(7);
    expect(after.gold).toBe(0);
    expect(() => expandStash(after)).toThrow(TownError);
  });

  it('moves items from the stash to equipment', () => {
    const sword = createItem('short_sword');
    const base = createProfile(createRng(1));
    const p = { ...base, stash: placeItem(base.stash, sword, 0, 0, 0) };
    const after = moveTownItem(p, { kind: 'stash', uid: sword.uid }, { kind: 'equip', slot: 'rightHand' });
    expect(after.loadout.equipment.rightHand?.uid).toBe(sword.uid);
    expect(() => moveTownItem(after, { kind: 'equip', slot: 'rightHand' }, { kind: 'loot' })).toThrow(TownError);
  });

  it('beginRaid empties the loadout and equips the free kit for the raid', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    expect(profile.loadout.equipment).toEqual({});
    expect(raid.adventurer.equipment.rightHand?.defId).toBe('rusty_dagger');
  });

  it('finishRaid after escaping keeps gear and converts bag gold', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    const escaped: RaidState = structuredClone(raid);
    escaped.status = 'escaped';
    escaped.adventurer.bagGrid = storeItem(storeItem(escaped.adventurer.bagGrid, createItem('gold', 40))!, createItem('gem'))!;
    const after = finishRaid(profile, escaped, rng);
    expect(after.gold).toBe(40);
    expect(countGold(after.loadout.bagGrid)).toBe(0);
    expect(after.loadout.bagGrid.placements.map((p) => p.item.defId)).toEqual(['old_knife', 'gem']);
    expect(after.loadout.equipment.rightHand?.defId).toBe('rusty_dagger');
    expect(after.raids).toBe(1);
  });

  it('finishRaid after escaping fully restores HP', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    const escaped: RaidState = structuredClone(raid);
    escaped.status = 'escaped';
    escaped.adventurer.hp = 7;
    expect(finishRaid(profile, escaped, rng).loadout.hp).toBe(50);
  });

  it('finishRaid after death loses everything carried', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    const dead: RaidState = { ...raid, status: 'dead' };
    const after = finishRaid(profile, dead, rng);
    expect(after.loadout.equipment).toEqual({});
    expect(after.loadout.bag).toBeNull();
  });

  it('finishRaid refuses an ongoing raid', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    expect(() => finishRaid(profile, raid, rng)).toThrow();
  });
});
