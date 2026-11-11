import { type Dungeon, neighbors, turnsUntilClosed } from '../../src/core/dungeon';
import { type Adventurer, computeStats } from '../../src/core/equipment';
import { GameError } from '../../src/core/errors';
import { getDef } from '../../src/core/items';
import { type RaidState, currentRoom, descend, drinkSpring, escape, moveTo, openChest, pickUp, startRaid } from '../../src/core/raid';
import { type Rng, createRng } from '../../src/core/rng';
import { withFreeKit } from '../../src/core/town';

/** あと何ターン以内に瘴気で閉鎖される部屋を避けるか */
const AVOID_CLOSING_WITHIN = 3;
/** この割合未満の HP では「物音」の部屋を避ける */
const LOW_HP = 0.5;
/** この割合未満の HP なら泉を使う */
const SPRING_HP = 0.7;
/** 1 回の潜入の行動数の上限（無限ループ防止） */
const MAX_ACTIONS = 300;

/** その部屋の中身をプレイヤーが知っているか（訪問済み、または訪問済みの部屋の隣で気配を見た） */
function known(d: Dungeon, index: number): boolean {
  return d.rooms[index].visited || neighbors(d, index).some((n) => d.rooms[n].visited);
}

function isSafe(s: RaidState, index: number, avoidMonsters: boolean): boolean {
  const d = s.dungeon;
  const room = d.rooms[index];
  const left = turnsUntilClosed(room, d.size, s.floorTurn);
  if (left !== null && left <= AVOID_CLOSING_WITHIN) return false;
  if (avoidMonsters && room.type === 'monster' && !room.cleared && known(d, index)) return false;
  return true;
}

/** 条件を満たす最寄りの部屋へ向かう最初の一歩（安全な経路が無ければ null） */
function firstStep(s: RaidState, isGoal: (index: number) => boolean, avoidMonsters: boolean): number | null {
  const prev = new Map<number, number>([[s.pos, -1]]);
  const queue = [s.pos];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur !== s.pos && isGoal(cur)) {
      let step = cur;
      while (prev.get(step) !== s.pos) step = prev.get(step)!;
      return step;
    }
    for (const n of neighbors(s.dungeon, cur)) {
      if (prev.has(n) || !isSafe(s, n, avoidMonsters)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  return null;
}

function chooseMove(s: RaidState, target: number, rng: Rng): number {
  const d = s.dungeon;
  const low = s.adventurer.hp < computeStats(s.adventurer.equipment).maxHp * LOW_HP;
  const goals: ((index: number) => boolean)[] = [];
  const exitRoom = s.exit.room;
  if (s.floor === target && s.exit.open && s.exit.discovered && exitRoom !== null) goals.push((i) => i === exitRoom);
  const stairs = d.stairs;
  if (s.floor < target && stairs !== null && known(d, stairs)) goals.push((i) => i === stairs);
  goals.push((i) => !d.rooms[i].visited);
  for (const goal of goals) {
    for (const avoid of low ? [true, false] : [false]) {
      const step = firstStep(s, goal, avoid);
      if (step !== null) return step;
    }
  }
  // 行ける目的地が無い：安全な隣の部屋を歩き回って、脱出口が開くのを待つ
  const options = neighbors(d, s.pos);
  const safe = options.filter((i) => isSafe(s, i, low));
  if (safe.length > 0) return rng.pick(safe);
  // 安全な部屋も無い：閉鎖が最も遅い隣の部屋へ
  const lateness = (i: number) => turnsUntilClosed(d.rooms[i], d.size, s.floorTurn) ?? Infinity;
  return options.reduce((best, i) => (lateness(i) > lateness(best) ? i : best), options[0]);
}

/** 仕様書 §7.3 の方針で 1 行動進める */
export function stepBot(s: RaidState, target: number, rng: Rng): RaidState {
  const room = currentRoom(s);
  const maxHp = computeStats(s.adventurer.equipment).maxHp;
  if (s.floor === target && s.exit.open && s.exit.room === s.pos) return escape(s, rng);
  if (s.floor < target && room.type === 'stairs') return descend(s, rng);
  if (room.type === 'chest' && !room.cleared) return openChest(s, rng);
  if (room.type === 'spring' && !room.cleared && s.adventurer.hp < maxHp * SPRING_HP) return drinkSpring(s, rng);
  let next = s;
  for (const item of room.floor) {
    const kind = getDef(item.defId).kind;
    if (kind !== 'gold' && kind !== 'treasure' && kind !== 'tool') continue;
    try {
      next = pickUp(next, item.uid);
    } catch (err) {
      if (!(err instanceof GameError)) throw err;
    }
  }
  return moveTo(next, chooseMove(next, target, rng), rng);
}

export function playRaid(start: RaidState, target: number, rng: Rng): RaidState {
  let s = start;
  for (let i = 0; i < MAX_ACTIONS && s.status === 'exploring'; i++) s = stepBot(s, target, rng);
  return s;
}

/** 目標の階のクリア率（その階まで降りて、その階から脱出できた割合） */
export function clearRate(makeLoadout: () => Adventurer, target: number, runs = 300): number {
  let cleared = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const rng = createRng(seed);
    const end = playRaid(startRaid(withFreeKit(makeLoadout()), rng), target, rng);
    if (end.status === 'escaped' && end.floor === target) cleared++;
  }
  return cleared / runs;
}
