import { type CombatResult, fighterFromAdventurer, fighterFromMonster, simulateCombat } from './combat';
import {
  type Dungeon, MAX_FLOOR, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  generateDungeon, isClosed, neighbors,
} from './dungeon';
import { type ExitState, discoverExit, initialExit, stepExit } from './exit';
import { type Adventurer, applyWear, computeStats } from './equipment';
import { GameError } from './errors';
import { type Dest, type Inventory, type Source, autoEquip, autoStore, moveItem } from './inventory';
import type { Grid } from './grid';
import { getDef } from './items';
import { rollChest, rollMonsterDrops } from './loot';
import { getMonster, scaledMonster } from './monsters';
import type { Rng } from './rng';
import { applyToolUsage } from './sequencer';

export const MOVE_TURNS = 1;
export const BATTLE_TURNS = 2;
export const SEARCH_TURNS = 1;
export const ESCAPE_TURNS = 3;
export const DESCEND_TURNS = 1;
export const TRAP_DAMAGE = 3;
export const MIASMA_DAMAGE = 6;

export type RaidStatus = 'exploring' | 'dead' | 'escaped';

export interface LastBattle {
  monsterId: string;
  result: CombatResult;
  /** 戦闘開始時のバッグ（戦闘画面の再生用） */
  bag: Grid;
}

export interface RaidState {
  dungeon: Dungeon;
  /** 地下何階にいるか（1〜MAX_FLOOR） */
  floor: number;
  /** この階に来てからのターン数（瘴気と脱出口のタイマー） */
  floorTurn: number;
  exit: ExitState;
  pos: number;
  /** 潜入開始からの通算ターン（ログ表示用） */
  turn: number;
  adventurer: Adventurer;
  status: RaidStatus;
  messages: string[];
  /** 直前の行動で起きた戦闘（UI の再生用） */
  lastBattle: LastBattle | null;
}

export class RaidError extends GameError {}

export function startRaid(adventurer: Adventurer, rng: Rng): RaidState {
  const dungeon = generateDungeon(rng, 1);
  const adv = structuredClone(adventurer);
  adv.hp = computeStats(adv.equipment).maxHp;
  return {
    dungeon, floor: 1, floorTurn: 0, exit: initialExit(), pos: dungeon.start, turn: 0,
    adventurer: adv, status: 'exploring', messages: ['[0] 地下1階に潜入した'], lastBattle: null,
  };
}

export function currentRoom(state: RaidState): Room {
  return state.dungeon.rooms[state.pos];
}

function assertExploring(state: RaidState): void {
  if (state.status !== 'exploring') throw new RaidError('潜入は終了しています');
}

function log(s: RaidState, message: string): void {
  s.messages.push(`[${s.turn}] ${message}`);
}

function damage(s: RaidState, amount: number, cause: string): void {
  s.adventurer.hp = Math.max(0, s.adventurer.hp - amount);
  if (s.adventurer.hp === 0) {
    s.status = 'dead';
    log(s, `${cause}で力尽きた…`);
  }
}

function advanceTime(s: RaidState, turns: number, rng: Rng): void {
  for (let i = 0; i < turns && s.status === 'exploring'; i++) {
    s.turn += 1;
    s.floorTurn += 1;
    const step = stepExit(s.exit, s.dungeon, s.pos, s.floorTurn, rng);
    s.exit = step.exit;
    if (step.event === 'opened') log(s, 'どこかで脱出口が開いた');
    if (step.event === 'closed') log(s, '脱出口が閉じた');
    for (const entry of MIASMA_SCHEDULE) {
      if (s.floorTurn === entry.turn - MIASMA_WARNING) log(s, `${MIASMA_WARNING}ターン後に瘴気が広がる`);
      if (s.floorTurn === entry.turn) log(s, '瘴気が広がった');
    }
    if (isClosed(currentRoom(s), s.dungeon.size, s.floorTurn)) {
      log(s, `瘴気で${MIASMA_DAMAGE}ダメージ`);
      damage(s, MIASMA_DAMAGE, '瘴気');
    }
    s.exit = discoverExit(s.exit, s.dungeon, s.pos);
  }
}

function fight(s: RaidState, room: Room, rng: Rng): void {
  if (!room.monsterId) throw new Error('monster room without monsterId');
  const monster = scaledMonster(getMonster(room.monsterId), s.floor);
  const bagBefore = structuredClone(s.adventurer.bagGrid);
  const result = simulateCombat(fighterFromAdventurer(s.adventurer), fighterFromMonster(monster), rng);
  s.lastBattle = { monsterId: monster.id, result, bag: bagBefore };
  s.adventurer.hp = result.finalHp[0];
  s.adventurer.bagGrid = applyToolUsage(s.adventurer.bagGrid, result.toolCharges, result.spentItems);
  s.adventurer.consumables = s.adventurer.consumables.map((c) => (c && result.usedConsumables.includes(c.uid) ? null : c));
  if (result.winner !== 0) {
    s.adventurer.hp = 0;
    s.status = 'dead';
    log(s, `${monster.name}に倒された…`);
    return;
  }
  room.cleared = true;
  log(s, `${monster.name}を倒した`);
  const worn = applyWear(s.adventurer);
  s.adventurer = worn.adventurer;
  s.adventurer.hp = Math.min(s.adventurer.hp, computeStats(s.adventurer.equipment).maxHp);
  for (const item of worn.broken) log(s, `${getDef(item.defId).name}が壊れた`);
  room.floor.push(...rollMonsterDrops(monster, rng));
  advanceTime(s, BATTLE_TURNS, rng);
}

export function moveTo(state: RaidState, target: number, rng: Rng): RaidState {
  assertExploring(state);
  if (!neighbors(state.dungeon, state.pos).includes(target)) throw new RaidError('その部屋には移動できません');
  const s = structuredClone(state);
  s.lastBattle = null;
  s.pos = target;
  advanceTime(s, MOVE_TURNS, rng);
  if (s.status !== 'exploring') return s;
  const room = currentRoom(s);
  room.visited = true;
  if (room.type === 'trap' && !room.cleared) {
    room.cleared = true;
    if (rng.chance(computeStats(s.adventurer.equipment).evasion)) log(s, '罠をかわした');
    else {
      log(s, `罠にかかり${TRAP_DAMAGE}ダメージ`);
      damage(s, TRAP_DAMAGE, '罠');
    }
  } else if (room.type === 'monster' && !room.cleared) {
    fight(s, room, rng);
  }
  return s;
}

export function openChest(state: RaidState, rng: Rng): RaidState {
  assertExploring(state);
  const target = currentRoom(state);
  if (target.type !== 'chest' || target.cleared) throw new RaidError('開けられる宝箱がありません');
  const s = structuredClone(state);
  s.lastBattle = null;
  const room = currentRoom(s);
  room.cleared = true;
  room.floor.push(...rollChest(rng, s.floor));
  log(s, '宝箱を開けた');
  advanceTime(s, SEARCH_TURNS, rng);
  return s;
}

export function drinkSpring(state: RaidState, rng: Rng): RaidState {
  assertExploring(state);
  const target = currentRoom(state);
  if (target.type !== 'spring' || target.cleared) throw new RaidError('飲める泉がありません');
  const s = structuredClone(state);
  s.lastBattle = null;
  currentRoom(s).cleared = true;
  const maxHp = computeStats(s.adventurer.equipment).maxHp;
  const before = s.adventurer.hp;
  s.adventurer.hp = Math.min(maxHp, before + Math.ceil(maxHp * 0.5));
  log(s, `泉の水でHPが${s.adventurer.hp - before}回復した`);
  advanceTime(s, SEARCH_TURNS, rng);
  return s;
}

export function escape(state: RaidState, rng: Rng): RaidState {
  assertExploring(state);
  if (!state.exit.open || state.exit.room !== state.pos) throw new RaidError('ここには開いている脱出口がありません');
  const s = structuredClone(state);
  s.lastBattle = null;
  log(s, '脱出の詠唱を始めた');
  // 詠唱を始めていれば、途中で脱出口が閉じても脱出できる
  advanceTime(s, ESCAPE_TURNS, rng);
  if (s.status === 'exploring') {
    s.status = 'escaped';
    log(s, '脱出に成功した！');
  }
  return s;
}

export function descend(state: RaidState, rng: Rng): RaidState {
  assertExploring(state);
  if (currentRoom(state).type !== 'stairs') throw new RaidError('ここには階段がありません');
  if (state.floor >= MAX_FLOOR) throw new RaidError('これより下の階はありません');
  const s = structuredClone(state);
  s.lastBattle = null;
  advanceTime(s, DESCEND_TURNS, rng);
  if (s.status !== 'exploring') return s;
  s.floor += 1;
  s.dungeon = generateDungeon(rng, s.floor);
  s.pos = s.dungeon.start;
  s.floorTurn = 0;
  s.exit = initialExit();
  log(s, `地下${s.floor}階に降りた`);
  return s;
}

function withInventory(state: RaidState, change: (inv: Inventory) => Inventory): RaidState {
  assertExploring(state);
  const s = structuredClone(state);
  s.lastBattle = null;
  const room = currentRoom(s);
  const inv = change({ adventurer: s.adventurer, stash: null, loot: room.floor });
  room.floor = inv.loot;
  s.adventurer = inv.adventurer;
  s.adventurer.hp = Math.min(s.adventurer.hp, computeStats(s.adventurer.equipment).maxHp);
  return s;
}

export function moveRaidItem(state: RaidState, src: Source, dest: Dest): RaidState {
  return withInventory(state, (inv) => moveItem(inv, src, dest));
}

/** バッグや床のアイテムを空き枠へ自動装備する（埋まっていれば入れ替え） */
export function equipRaidItem(state: RaidState, src: Source): RaidState {
  return withInventory(state, (inv) => autoEquip(inv, src));
}

export function pickUp(state: RaidState, uid: string): RaidState {
  return withInventory(state, (inv) => autoStore(inv, { kind: 'loot', uid }, 'bag'));
}
