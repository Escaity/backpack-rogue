import { type ItemInstance, getDef } from './items';
import type { Profile } from './town';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SAVE_KEY = 'backpack-rogue/save';
export const SAVE_VERSION = 1;

export function saveProfile(storage: KeyValueStorage, profile: Profile): void {
  storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, profile }));
}

export function clearSave(storage: KeyValueStorage): void {
  storage.removeItem(SAVE_KEY);
}

export function loadProfile(storage: KeyValueStorage): Profile | null {
  const raw = storage.getItem(SAVE_KEY);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const file = parsed as { version?: unknown; profile?: unknown };
  if (file.version !== SAVE_VERSION || !looksLikeProfile(file.profile)) return null;
  try {
    for (const item of allItems(file.profile)) getDef(item.defId);
  } catch {
    return null;
  }
  return file.profile;
}

function looksLikeProfile(value: unknown): value is Profile {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  const stash = p.stash as Record<string, unknown> | undefined;
  const loadout = p.loadout as Record<string, unknown> | undefined;
  return (
    typeof p.gold === 'number' &&
    typeof p.raids === 'number' &&
    Array.isArray(p.shop) &&
    typeof stash === 'object' && stash !== null && Array.isArray(stash.placements) &&
    typeof loadout === 'object' && loadout !== null && Array.isArray(loadout.consumables) &&
    typeof loadout.bagGrid === 'object' && loadout.bagGrid !== null
  );
}

function allItems(profile: Profile): ItemInstance[] {
  const l = profile.loadout;
  return [
    ...profile.stash.placements.map((p) => p.item),
    ...Object.values(l.equipment).filter((i): i is ItemInstance => i !== undefined),
    ...l.consumables.filter((i): i is ItemInstance => i !== null),
    ...(l.bag ? [l.bag] : []),
    ...l.bagGrid.placements.map((p) => p.item),
    ...profile.shop,
  ];
}
