import { describe, expect, it } from 'vitest';
import { placeItem } from '../../src/core/grid';
import { createItem } from '../../src/core/items';
import { createRng } from '../../src/core/rng';
import { type KeyValueStorage, SAVE_KEY, clearSave, loadProfile, saveProfile } from '../../src/core/save';
import { createProfile } from '../../src/core/town';

class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('save', () => {
  it('fills missing charges from the item definition when loading old saves', () => {
    const storage = new MemoryStorage();
    const base = createProfile(createRng(1));
    const herb = createItem('herb');
    const knife = createItem('throwing_knife');
    const profile = { ...base, stash: placeItem(placeItem(base.stash, herb, 0, 0, 0), knife, 1, 0, 0) };
    const raw = JSON.parse(JSON.stringify({ version: 1, profile }));
    for (const p of raw.profile.stash.placements) delete p.item.charges;
    storage.setItem(SAVE_KEY, JSON.stringify(raw));
    const loaded = loadProfile(storage)!;
    expect(loaded.stash.placements.map((p) => p.item.charges)).toEqual([3, null]);
  });

  it('round-trips a profile', () => {
    const storage = new MemoryStorage();
    const base = createProfile(createRng(1));
    const profile = { ...base, gold: 123, stash: placeItem(base.stash, createItem('gem'), 2, 3, 0) };
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toEqual(profile);
  });

  it('returns null when nothing is saved', () => {
    expect(loadProfile(new MemoryStorage())).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadProfile(storage)).toBeNull();
  });

  it('returns null for another version', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, profile: createProfile(createRng(1)) }));
    expect(loadProfile(storage)).toBeNull();
  });

  it('returns null when an item id is unknown', () => {
    const storage = new MemoryStorage();
    const profile = createProfile(createRng(1));
    profile.shop[0] = { ...profile.shop[0], defId: 'removed_item' };
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toBeNull();
  });

  it('clearSave removes the save', () => {
    const storage = new MemoryStorage();
    saveProfile(storage, createProfile(createRng(1)));
    clearSave(storage);
    expect(loadProfile(storage)).toBeNull();
  });
});
