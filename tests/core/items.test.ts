import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, createItem, getDef, newUid, rotateShape } from '../../src/core/items';

describe('items', () => {
  it('newUid returns distinct non-empty strings', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newUid()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id.length).toBeGreaterThan(0);
  });

  it('getDef throws for unknown ids', () => {
    expect(() => getDef('nope')).toThrow();
  });

  it('createItem sets durability from the definition', () => {
    expect(createItem('short_sword').durability).toBe(25);
    expect(createItem('gem').durability).toBeNull();
  });

  it('createItem gives unique uids', () => {
    expect(createItem('gem').uid).not.toBe(createItem('gem').uid);
  });

  it('rotates a vertical bar to horizontal', () => {
    expect(rotateShape([[0, 0], [0, 1], [0, 2]], 1)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it('rotates an L shape clockwise', () => {
    expect(rotateShape([[0, 0], [1, 0], [0, 1], [0, 2]], 1)).toEqual([[0, 0], [1, 0], [2, 0], [2, 1]]);
  });

  it('rotation 0 keeps the shape (sorted)', () => {
    expect(rotateShape([[1, 0], [0, 0]], 0)).toEqual([[0, 0], [1, 0]]);
  });

  it('every definition is consistent', () => {
    for (const def of Object.values(ITEM_DEFS)) {
      expect(def.shape.length, def.id).toBeGreaterThan(0);
      if (def.kind === 'equipment') expect(def.slot, def.id).toBeDefined();
      if (def.kind === 'bag') expect(def.bagSize, def.id).toBeDefined();
      if (def.kind === 'consumable') expect(def.consumable, def.id).toBeDefined();
      if (def.slot === 'weapon') expect(def.weapon, def.id).toBeDefined();
    }
  });
});
