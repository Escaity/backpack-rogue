import { type CombatResult, fighterFromAdventurer, fighterFromMonster, simulateCombat } from './combat';
import {
  type Dungeon, EXIT_OPEN_TURN, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  generateDungeon, isClosed, isExitOpen, neighbors,
} from './dungeon';
import { type Adventurer, applyWear, computeStats } from './equipment';
import { GameError } from './errors';
import { type Dest, type Inventory, type Source, autoEquip, autoStore, moveItem } from './inventory';
import { getDef } from './items';
import { rollChest, rollMonsterDrops } from './loot';
import { MONSTER_IDS, getMonster } from './monsters';
import type { Rng } from './rng';

export const MOVE_TURNS = 1;
export const BATTLE_TURNS = 2;
export const SEARCH_TURNS = 1;
export const ESCAPE_TURNS = 3;
export const TRAP_DAMAGE = 8;
export const MIASMA_DAMAGE = 6;

export type RaidStatus = 'exploring' | 'dead' | 'escaped';

export interface LastBattle {
  monsterId: string;
  result: CombatResult;
}

export interface RaidState {
  dungeon: Dungeon;
  pos: number;
  turn: number;
  adventurer: Adventurer;
  status: RaidStatus;
  messages: string[];
  /** 直前の行動で起きた戦闘（UI の再生用） */
  lastBattle: LastBattle | null;
}

export class RaidError extends GameError {}

export function startRaid(adventurer: Adventurer, rng: Rng): RaidState {
  const dungeon = generateDungeon(rng, MONSTER_IDS);
  const adv = structuredClone(adventurer);
  adv.hp = computeStats(adv.equipment).maxHp;
  return { dungeon, pos: dungeon.start, turn: 0, adventurer: adv, status: 'exploring', messages: ['[0] ダンジョンに潜入した'], lastBattle: null };
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

function advanceTime(s: RaidState, turns: number): void {
  for (let i = 0; i < turns && s.status === 'exploring'; i++) {
    s.turn += 1;
    if (s.turn === EXIT_OPEN_TURN) log(s, 'どこかで脱出口が開いた');
    for (const entry of MIASMA_SCHEDULE) {
      if (s.turn === entry.turn - MIASMA_WARNING) log(s, `${MIASMA_WARNING}ターン後に瘴気が広がる`);
      if (s.turn === entry.turn) log(s, '瘴気が広がった');
    }
    if (isClosed(currentRoom(s), s.dungeon.size, s.turn)) {
      log(s, `瘴気で${MIASMA_DAMAGE}ダメージ`);
      damage(s, MIASMA_DAMAGE, '瘴気');
    }
  }
}

function fight(s: RaidState, room: Room, rng: Rng): void {
  if (!room.monsterId) throw new Error('monster room without monsterId');
  const monster = getMonster(room.monsterId);
  const result = simulateCombat(fighterFromAdventurer(s.adventurer), fighterFromMonster(monster), rng);
  s.lastBattle = { monsterId: monster.id, result };
  s.adventurer.hp = result.finalHp[0];
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
  advanceTime(s, BATTLE_TURNS);
}

export function moveTo(state: RaidState, target: number, rng: Rng): RaidState {
  assertExploring(state);
  if (!neighbors(state.dungeon, state.pos).includes(target)) throw new RaidError('その部屋には移動できません');
  const s = structuredClone(state);
  s.lastBattle = null;
  s.pos = target;
  advanceTime(s, MOVE_TURNS);
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
  room.floor.push(...rollChest(rng));
  log(s, '宝箱を開けた');
  advanceTime(s, SEARCH_TURNS);
  return s;
}

export function drinkSpring(state: RaidState): RaidState {
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
  advanceTime(s, SEARCH_TURNS);
  return s;
}

export function escape(state: RaidState): RaidState {
  assertExploring(state);
  if (currentRoom(state).type !== 'exit') throw new RaidError('ここは脱出口ではありません');
  if (!isExitOpen(state.turn)) throw new RaidError(`脱出口は${EXIT_OPEN_TURN}ターン目に開きます`);
  const s = structuredClone(state);
  s.lastBattle = null;
  log(s, '脱出の詠唱を始めた');
  advanceTime(s, ESCAPE_TURNS);
  if (s.status === 'exploring') {
    s.status = 'escaped';
    log(s, '脱出に成功した！');
  }
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
