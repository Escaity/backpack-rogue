import { type Dice, averageDice, dice, formatDice, rollDice } from './dice';
import { type Adventurer, BASE_STATS, type Stats, computeStats, consumableSlotCount, weaponsOf } from './equipment';
import { type ConsumableEffect, type PeriodicHeal, type WeaponStats, getDef } from './items';
import type { MonsterDef } from './monsters';
import type { Rng } from './rng';
import { type SeqEntry, buildSequence, toolEffectText } from './sequencer';

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
  /** ベルトの消費アイテム枠（緊急用） */
  consumables: FighterConsumable[];
  /** バッグの列数。0 ならシーケンサーなし */
  bagWidth: number;
  /** バッグの戦闘道具（上の行→左の列の順） */
  sequence: SeqEntry[];
}

export type CombatEvent =
  | { t: number; kind: 'hit'; actor: Side; dice: string; roll: number; bonus: number; blocked: number; damage: number; targetHp: number }
  | { t: number; kind: 'miss'; actor: Side }
  | { t: number; kind: 'heal'; actor: Side; amount: number; hp: number; source: string; uid?: string }
  /** actor は疲労ダメージを受けた側 */
  | { t: number; kind: 'fatigue'; actor: Side; damage: number; hp: number }
  | { t: number; kind: 'cursor'; actor: Side; col: number }
  | { t: number; kind: 'toolHit'; actor: Side; uid: string; name: string; dice: string; roll: number; blocked: number; damage: number; targetHp: number }
  | { t: number; kind: 'toolMiss'; actor: Side; uid: string; name: string }
  | { t: number; kind: 'buff'; actor: Side; uid: string; name: string; text: string };

export interface CombatResult {
  winner: Side;
  events: CombatEvent[];
  startHp: [number, number];
  maxHp: [number, number];
  finalHp: [number, number];
  /** 側 0 がベルトから使った消費アイテムの uid */
  usedConsumables: string[];
  /** 側 0 の道具のうち、回数が減ったが残っているものの残り回数 */
  toolCharges: Record<string, number>;
  /** 側 0 の道具・バッグの消費アイテムのうち、使い切ったものの uid */
  spentItems: string[];
  duration: number;
}

export const TICK = 0.1;
export const FATIGUE_START = 15;
export const MAX_DURATION = 60;
export const FISTS: WeaponStats = { dice: dice(1, 2), cooldown: 1.5, staminaCost: 0 };
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
    bagWidth: adv.bagGrid.w,
    sequence: buildSequence(adv.bagGrid),
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
    bagWidth: 0,
    sequence: [],
  };
}

interface FighterState {
  f: Fighter;
  hp: number;
  stamina: number;
  weaponTimers: number[];
  healTimers: number[];
  unused: FighterConsumable[];
  /** sequence[i] が次に発動できる時刻 */
  readyAt: number[];
  charges: (number | null)[];
  /** 砥石：次の武器攻撃に足すダイス */
  sharpen: Dice | null;
  /** 盾布：次に当たった攻撃の軽減量（0 なら無し） */
  guard: number;
}

function initState(f: Fighter): FighterState {
  return {
    f,
    hp: f.hp,
    stamina: f.stats.maxStamina,
    weaponTimers: f.weapons.map(() => 0),
    healTimers: f.periodicHeals.map(() => 0),
    unused: [...f.consumables],
    readyAt: f.sequence.map(() => 0),
    charges: f.sequence.map((e) => e.charges),
    sharpen: null,
    guard: 0,
  };
}

function heal(me: FighterState, side: Side, amount: number, source: string, t: number, events: CombatEvent[], uid?: string): void {
  const actual = Math.min(amount, me.f.stats.maxHp - me.hp);
  if (actual <= 0) return;
  me.hp += actual;
  events.push(uid ? { t, kind: 'heal', actor: side, amount: actual, hp: me.hp, source, uid } : { t, kind: 'heal', actor: side, amount: actual, hp: me.hp, source });
}

/** 防御による軽減の基準値。防御がこの値と同じとき、ダメージは半分になる */
export const DEFENSE_SCALE = 10;

/** 防御による割合軽減（最低 1） */
export function mitigate(raw: number, defense: number): number {
  return Math.max(1, Math.round((raw * DEFENSE_SCALE) / (DEFENSE_SCALE + defense)));
}

/** 当たった攻撃のダメージを計算して与える（防御で割合軽減して最低 1、その後に盾布で軽減） */
function strike(foe: FighterState, raw: number): { damage: number; blocked: number } {
  let damage = mitigate(raw, foe.f.stats.defense);
  let blocked = 0;
  if (foe.guard > 0) {
    blocked = Math.min(foe.guard, damage);
    damage -= blocked;
    foe.guard = 0;
  }
  foe.hp = Math.max(0, foe.hp - damage);
  return { damage, blocked };
}

/** 道具を 1 回発動する。発動しなかった（満タンで回復が無駄など）場合は false */
function fireTool(me: FighterState, foe: FighterState, side: Side, entry: SeqEntry, t: number, rng: Rng, events: CombatEvent[]): boolean {
  const effect = entry.effect;
  switch (effect.kind) {
    case 'damage': {
      if (rng.chance(foe.f.stats.evasion)) {
        events.push({ t, kind: 'toolMiss', actor: side, uid: entry.uid, name: entry.label });
        return true;
      }
      const roll = rollDice(effect.dice, rng);
      const { damage, blocked } = strike(foe, roll);
      events.push({ t, kind: 'toolHit', actor: side, uid: entry.uid, name: entry.label, dice: formatDice(effect.dice), roll, blocked, damage, targetHp: foe.hp });
      return true;
    }
    case 'sharpen':
      me.sharpen = effect.dice;
      events.push({ t, kind: 'buff', actor: side, uid: entry.uid, name: entry.label, text: toolEffectText(effect) });
      return true;
    case 'guard':
      me.guard = effect.amount;
      events.push({ t, kind: 'buff', actor: side, uid: entry.uid, name: entry.label, text: toolEffectText(effect) });
      return true;
    case 'heal':
      // 回復量の期待値以上に HP が減っているときだけ使う（少しの減りで回数を無駄にしない）
      if (me.f.stats.maxHp - me.hp < averageDice(effect.dice)) return false;
      heal(me, side, rollDice(effect.dice, rng), entry.label, t, events, entry.uid);
      return true;
    case 'stamina':
      if (me.f.stats.maxStamina - me.stamina < effect.amount - EPS) return false;
      me.stamina = Math.min(me.f.stats.maxStamina, me.stamina + effect.amount);
      events.push({ t, kind: 'buff', actor: side, uid: entry.uid, name: entry.label, text: toolEffectText(effect) });
      return true;
  }
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
        const bonusDice = me.sharpen;
        me.sharpen = null;
        if (rng.chance(foe.f.stats.evasion)) {
          events.push({ t, kind: 'miss', actor: side });
          return;
        }
        const roll = rollDice(w.dice, rng);
        const bonus = bonusDice ? rollDice(bonusDice, rng) : 0;
        const { damage, blocked } = strike(foe, roll + bonus);
        events.push({ t, kind: 'hit', actor: side, dice: formatDice(w.dice), roll, bonus, blocked, damage, targetHp: foe.hp });
      });

      me.f.periodicHeals.forEach((h, i) => {
        if (!alive()) return;
        me.healTimers[i] += TICK;
        if (me.healTimers[i] < h.every - EPS) return;
        me.healTimers[i] = 0;
        heal(me, side, h.heal, '回復効果', t, events);
      });

      const second = Math.round(t);
      if (alive() && me.f.bagWidth > 0 && second >= 1 && Math.abs(t - second) < EPS) {
        const col = (second - 1) % me.f.bagWidth;
        events.push({ t, kind: 'cursor', actor: side, col });
        me.f.sequence.forEach((entry, i) => {
          if (!alive() || !entry.cols.includes(col)) return;
          if (me.charges[i] === 0 || t < me.readyAt[i] - EPS) return;
          if (!fireTool(me, foe, side, entry, t, rng, events)) return;
          me.readyAt[i] = t + entry.cooldown;
          const left = me.charges[i];
          if (left !== null) me.charges[i] = left - 1;
        });
      }

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

  const toolCharges: Record<string, number> = {};
  const spentItems: string[] = [];
  a.sequence.forEach((entry, i) => {
    const left = states[0].charges[i];
    if (left === null || left === entry.charges) return;
    if (left <= 0) spentItems.push(entry.uid);
    else toolCharges[entry.uid] = left;
  });

  const winner: Side = states[0].hp > 0 && states[1].hp <= 0 ? 0 : 1;
  return {
    winner,
    events,
    startHp: [a.hp, b.hp],
    maxHp: [a.stats.maxHp, b.stats.maxHp],
    finalHp: [states[0].hp, states[1].hp],
    usedConsumables: used,
    toolCharges,
    spentItems,
    duration: t,
  };
}
