import { describe, expect, it } from 'vitest';
import { createItem } from '../../src/core/items';
import {
  canPlace, countGold, createGrid, findItemAt, placeItem, removeAllGold, removeItem, storeItem, storePartial,
} from '../../src/core/grid';

describe('grid', () => {
  it('places an item and finds it by any of its cells', () => {
    const sword = createItem('short_sword');
    const g = placeItem(createGrid(4, 3), sword, 0, 0, 0);
    expect(findItemAt(g, 0, 2)?.item.uid).toBe(sword.uid);
    expect(findItemAt(g, 1, 0)).toBeUndefined();
  });

  it('rejects out of bounds', () => {
    expect(canPlace(createGrid(4, 3), createItem('short_sword'), 0, 1, 0)).toBe(false);
  });

  it('allows a rotated placement', () => {
    const g = createGrid(4, 1);
    expect(canPlace(g, createItem('short_sword'), 0, 0, 0)).toBe(false);
    expect(canPlace(g, createItem('short_sword'), 0, 0, 1)).toBe(true);
  });

  it('rejects overlap but can ignore the moving item itself', () => {
    const sword = createItem('short_sword');
    const g = placeItem(createGrid(4, 3), sword, 0, 0, 0);
    expect(canPlace(g, createItem('gem'), 0, 1, 0)).toBe(false);
    expect(canPlace(g, sword, 0, 0, 0, sword.uid)).toBe(true);
  });

  it('placeItem throws when the spot is invalid', () => {
    expect(() => placeItem(createGrid(1, 1), createItem('short_sword'), 0, 0, 0)).toThrow();
  });

  it('removeItem returns the removed item and a new grid', () => {
    const gem = createItem('gem');
    const g = placeItem(createGrid(2, 2), gem, 1, 1, 0);
    const r = removeItem(g, gem.uid);
    expect(r.item.uid).toBe(gem.uid);
    expect(r.grid.placements).toHaveLength(0);
    expect(g.placements).toHaveLength(1);
  });

  it('removeItem throws for unknown uid', () => {
    expect(() => removeItem(createGrid(1, 1), 'missing')).toThrow();
  });

  it('storeItem finds a free spot and returns null when full', () => {
    let g = createGrid(1, 1);
    g = storeItem(g, createItem('gem'))!;
    expect(g.placements).toHaveLength(1);
    expect(storeItem(g, createItem('gem'))).toBeNull();
  });

  it('storeItem rotates items when needed', () => {
    const g = storeItem(createGrid(3, 1), createItem('short_sword'));
    expect(g?.placements[0].rot).toBe(1);
  });

  it('stacks gold up to 50 per cell', () => {
    let g = createGrid(3, 1);
    g = storeItem(g, createItem('gold', 30))!;
    g = storeItem(g, createItem('gold', 30))!;
    expect(g.placements.map((p) => p.item.qty).sort((a, b) => a - b)).toEqual([10, 50]);
    expect(countGold(g)).toBe(60);
  });

  it('removeAllGold strips gold and reports the amount', () => {
    let g = createGrid(3, 1);
    g = storeItem(g, createItem('gold', 20))!;
    g = storeItem(g, createItem('gem'))!;
    const r = removeAllGold(g);
    expect(r.amount).toBe(20);
    expect(r.grid.placements.map((p) => p.item.defId)).toEqual(['gem']);
  });

  it('storePartial stores as much of a stackable as fits and returns the leftover', () => {
    let g = createGrid(1, 1);
    g = storeItem(g, createItem('gold', 30))!;
    const r = storePartial(g, createItem('gold', 45));
    expect(countGold(r.grid)).toBe(50);
    expect(r.leftover?.qty).toBe(25);
    expect(r.leftover?.defId).toBe('gold');
  });

  it('storePartial leaves non-stackables whole or untouched', () => {
    const r = storePartial(createGrid(1, 1), createItem('old_painting'));
    expect(r.grid.placements).toHaveLength(0);
    expect(r.leftover?.defId).toBe('old_painting');
  });

  it('storePartial reports no leftover when everything fits', () => {
    const r = storePartial(createGrid(2, 1), createItem('gold', 70));
    expect(r.leftover).toBeNull();
    expect(countGold(r.grid)).toBe(70);
  });

  it('storeItem stays all-or-nothing for stackables', () => {
    expect(storeItem(createGrid(1, 1), createItem('gold', 70))).toBeNull();
  });
});
