import { type Dungeon, isClosed, neighbors, turnsUntilClosed } from './dungeon';
import type { Rng } from './rng';

/** 最初に開く階ターン */
export const EXIT_FIRST_OPEN = 10;
/** 開いている長さ（ターン） */
export const EXIT_OPEN_LENGTH = 8;
/** 閉じている長さ（ターン） */
export const EXIT_CLOSED_LENGTH = 4;

export interface ExitState {
  /** 今開いている部屋。閉じているときは null */
  room: number | null;
  open: boolean;
  /** プレイヤーが今の脱出口を見つけたか（マップに表示するか） */
  discovered: boolean;
  /** 直前に開いていた部屋（次は別の部屋で開く） */
  last: number | null;
}

export function initialExit(): ExitState {
  return { room: null, open: false, discovered: false, last: null };
}

/** 階ターンでの開閉の予定と、次に切り替わるまでのターン数 */
export function exitPhase(floorTurn: number): { open: boolean; turnsLeft: number } {
  if (floorTurn < EXIT_FIRST_OPEN) return { open: false, turnsLeft: EXIT_FIRST_OPEN - floorTurn };
  const cycle = EXIT_OPEN_LENGTH + EXIT_CLOSED_LENGTH;
  const k = (floorTurn - EXIT_FIRST_OPEN) % cycle;
  return k < EXIT_OPEN_LENGTH ? { open: true, turnsLeft: EXIT_OPEN_LENGTH - k } : { open: false, turnsLeft: cycle - k };
}

/**
 * 脱出口を開く部屋を選ぶ。優先順位は次のとおり。
 * 1. 今いる部屋・階段・直前の部屋ではなく、開いている間に瘴気で閉鎖されない部屋
 * 2. 今いる部屋・階段・直前の部屋ではなく、今閉鎖されていない部屋
 * 3. 今閉鎖されていない部屋（後半に安全な部屋が少ないとき、脱出口が開かなくなるのを防ぐ）
 */
export function chooseExitRoom(d: Dungeon, pos: number, floorTurn: number, last: number | null, rng: Rng): number | null {
  const open = d.rooms.filter((r) => !isClosed(r, d.size, floorTurn));
  const fresh = open.filter((r) => r.index !== pos && r.index !== d.stairs && r.index !== last);
  const stable = fresh.filter((r) => {
    const left = turnsUntilClosed(r, d.size, floorTurn);
    return left === null || left >= EXIT_OPEN_LENGTH;
  });
  const tier = [stable, fresh, open].find((t) => t.length > 0);
  return tier ? rng.pick(tier).index : null;
}

/** 階ターンが 1 進んだときの脱出口の変化 */
export function stepExit(exit: ExitState, d: Dungeon, pos: number, floorTurn: number, rng: Rng): { exit: ExitState; event: 'opened' | 'closed' | null } {
  const phase = exitPhase(floorTurn);
  if (exit.open && !phase.open) {
    return { exit: { room: null, open: false, discovered: false, last: exit.room }, event: 'closed' };
  }
  if (!exit.open && phase.open) {
    const room = chooseExitRoom(d, pos, floorTurn, exit.last, rng);
    if (room !== null) return { exit: { ...exit, room, open: true, discovered: false }, event: 'opened' };
  }
  return { exit, event: null };
}

/** 脱出口の部屋か、その隣の部屋にいれば発見済みにする */
export function discoverExit(exit: ExitState, d: Dungeon, pos: number): ExitState {
  if (!exit.open || exit.room === null || exit.discovered) return exit;
  if (exit.room === pos || neighbors(d, pos).includes(exit.room)) return { ...exit, discovered: true };
  return exit;
}

/** 画面表示用：今開いているか、あと何ターンで切り替わるか */
export function exitStatus(exit: ExitState, floorTurn: number): { open: boolean; turnsLeft: number } {
  const phase = exitPhase(floorTurn);
  if (exit.open) return phase;
  return phase.open ? { open: false, turnsLeft: phase.turnsLeft + EXIT_CLOSED_LENGTH } : phase;
}
