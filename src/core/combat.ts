import { type Adventurer, BASE_STATS, type Stats, computeStats, consumableSlotCount, weaponsOf } from './equipment';
import { type ConsumableEffect, type PeriodicHeal, type WeaponStats, getDef } from './items';
import type { MonsterDef } from './monsters';
import type { Rng } from './rng';

export type Side = 0 | 1;

export interface FighterConsumable {
  uid: string;
  name: string;
  effect: ConsumableEffect;
}

export interface Fighter {
  name: string;
  icon: string;
  stats: Stats;
  hp: number;
  weapons: WeaponStats[];
  periodicHeals: PeriodicHeal[];
  consumables: FighterConsumable[];
}

export type CombatEvent =
  | { t: number; kind: 'hit'; actor: Side; damage: number; targetHp: number }
  | { t: number; kind: 'miss'; actor: Side }
  | { t: number; kind: 'heal'; actor: Side; amount: number; hp: number; source: string }
  /** actor は疲労ダメージを受けた側 */
  | { t: number; kind: 'fatigue'; actor: Side; damage: number; hp: number };

export interface CombatResult {
  winner: Side;
  events: CombatEvent[];
  startHp: [number, number];
  maxHp: [number, number];
  finalHp: [number, number];
  /** 側 0 が使った消費アイテムの uid */
  usedConsumables: string[];
  duration: number;
}

export const TICK = 0.1;
export const FATIGUE_START = 15;
export const MAX_DURATION = 60;
export const FISTS: WeaponStats = { damage: 1, cooldown: 1.5, staminaCost: 0 };
const EPS = 1e-9;

export function fighterFromAdventurer(adv: Adventurer, name = 'あなた'): Fighter {
  const weapons = weaponsOf(adv.equipment);
  const usable = adv.consumables.slice(0, consumableSlotCount(adv.equipment));
  return {
    name,
    icon: '🧙',
    stats: computeStats(adv.equipment),
    hp: adv.hp,
    weapons: weapons.length > 0 ? weapons : [FISTS],
    periodicHeals: Object.values(adv.equipment).flatMap((item) => {
      const heal = item ? getDef(item.defId).periodicHeal : undefined;
      return heal ? [heal] : [];
    }),
    consumables: usable.flatMap((item) => {
      if (!item) return [];
      const def = getDef(item.defId);
      return def.consumable ? [{ uid: item.uid, name: def.name, effect: def.consumable }] : [];
    }),
  };
}

export function fighterFromMonster(m: MonsterDef): Fighter {
  return {
    name: m.name,
    icon: m.icon,
    stats: { ...BASE_STATS, maxHp: m.maxHp, defense: m.defense, evasion: m.evasion, maxStamina: 0, staminaRegen: 0 },
    hp: m.maxHp,
    weapons: [m.weapon],
    periodicHeals: [],
    consumables: [],
  };
}

interface FighterState {
  f: Fighter;
  hp: number;
  stamina: number;
  weaponTimers: number[];
  healTimers: number[];
  unused: FighterConsumable[];
}

function initState(f: Fighter): FighterState {
  return {
    f, hp: f.hp, stamina: f.stats.maxStamina,
    weaponTimers: f.weapons.map(() => 0), healTimers: f.periodicHeals.map(() => 0), unused: [...f.consumables],
  };
}

function heal(me: FighterState, side: Side, amount: number, source: string, t: number, events: CombatEvent[]): void {
  const actual = Math.min(amount, me.f.stats.maxHp - me.hp);
  if (actual <= 0) return;
  me.hp += actual;
  events.push({ t, kind: 'heal', actor: side, amount: actual, hp: me.hp, source });
}

export function simulateCombat(a: Fighter, b: Fighter, rng: Rng): CombatResult {
  const states: [FighterState, FighterState] = [initState(a), initState(b)];
  const events: CombatEvent[] = [];
  const used: string[] = [];
  const alive = (): boolean => states[0].hp > 0 && states[1].hp > 0;
  let t = 0;
  let nextFatigue = FATIGUE_START;
  let fatigueDamage = 1;

  while (alive() && t < MAX_DURATION - EPS) {
    t = Math.round((t + TICK) * 10) / 10;
    for (const side of [0, 1] as const) {
      if (!alive()) break;
      const me = states[side];
      const foe = states[side === 0 ? 1 : 0];
      me.stamina = Math.min(me.f.stats.maxStamina, me.stamina + me.f.stats.staminaRegen * TICK);

      me.f.weapons.forEach((w, i) => {
        if (!alive()) return;
        me.weaponTimers[i] = Math.min(w.cooldown, me.weaponTimers[i] + TICK * me.f.stats.attackSpeed);
        if (me.weaponTimers[i] < w.cooldown - EPS || me.stamina < w.staminaCost - EPS) return;
        me.stamina -= w.staminaCost;
        me.weaponTimers[i] = 0;
        if (rng.chance(foe.f.stats.evasion)) {
          events.push({ t, kind: 'miss', actor: side });
          return;
        }
        const damage = Math.max(1, w.damage - foe.f.stats.defense);
        foe.hp = Math.max(0, foe.hp - damage);
        events.push({ t, kind: 'hit', actor: side, damage, targetHp: foe.hp });
      });

      me.f.periodicHeals.forEach((h, i) => {
        if (!alive()) return;
        me.healTimers[i] += TICK;
        if (me.healTimers[i] < h.every - EPS) return;
        me.healTimers[i] = 0;
        heal(me, side, h.heal, '回復効果', t, events);
      });

      if (alive()) {
        const idx = me.unused.findIndex((c) => me.hp / me.f.stats.maxHp < c.effect.hpBelow);
        if (idx >= 0) {
          const c = me.unused[idx];
          me.unused.splice(idx, 1);
          if (side === 0) used.push(c.uid);
          heal(me, side, c.effect.heal, c.name, t, events);
        }
      }
    }

    if (alive() && t >= nextFatigue - EPS) {
      for (const side of [0, 1] as const) {
        const me = states[side];
        me.hp = Math.max(0, me.hp - fatigueDamage);
        events.push({ t, kind: 'fatigue', actor: side, damage: fatigueDamage, hp: me.hp });
      }
      fatigueDamage += 1;
      nextFatigue += 1;
    }
  }

  const winner: Side = states[0].hp > 0 && states[1].hp <= 0 ? 0 : 1;
  return {
    winner,
    events,
    startHp: [a.hp, b.hp],
    maxHp: [a.stats.maxHp, b.stats.maxHp],
    finalHp: [states[0].hp, states[1].hp],
    usedConsumables: used,
    duration: t,
  };
}
