import { describe, expect, it } from 'vitest';
import { generateDungeon, neighbors, ringOf } from '../../src/core/dungeon';
import { EXIT_CLOSED_LENGTH, chooseExitRoom, discoverExit, exitPhase, exitStatus, initialExit, stepExit } from '../../src/core/exit';
import { createRng } from '../../src/core/rng';

describe('exit', () => {
  it('opens at floor turn 10 for 8 turns, then closes for 4 turns', () => {
    expect(exitPhase(0)).toEqual({ open: false, turnsLeft: 10 });
    expect(exitPhase(9)).toEqual({ open: false, turnsLeft: 1 });
    expect(exitPhase(10)).toEqual({ open: true, turnsLeft: 8 });
    expect(exitPhase(17)).toEqual({ open: true, turnsLeft: 1 });
    expect(exitPhase(18)).toEqual({ open: false, turnsLeft: 4 });
    expect(exitPhase(21)).toEqual({ open: false, turnsLeft: 1 });
    expect(exitPhase(22)).toEqual({ open: true, turnsLeft: 8 });
  });

  it('never picks the current room, the stairs, the previous exit or a closed room', () => {
    const d = generateDungeon(createRng(4), 1);
    const pos = d.start;
    const last = neighbors(d, pos)[0];
    for (let seed = 0; seed < 200; seed++) {
      const room = chooseExitRoom(d, pos, 30, last, createRng(seed));
      expect(room).not.toBeNull();
      expect([pos, d.stairs, last]).not.toContain(room);
      expect(ringOf(d.rooms[room!], d.size)).toBeLessThan(2);
    }
  });

  it('opens at the start of an open window', () => {
    const d = generateDungeon(createRng(4), 1);
    expect(stepExit(initialExit(), d, d.start, 9, createRng(1))).toEqual({ exit: initialExit(), event: null });
    const opened = stepExit(initialExit(), d, d.start, 10, createRng(1));
    expect(opened.event).toBe('opened');
    expect(opened.exit.open).toBe(true);
    expect(opened.exit.room).not.toBe(d.start);
  });

  it('prefers rooms that miasma will not close while the exit is open', () => {
    const d = generateDungeon(createRng(4), 1);
    // 階ターン 22 から 8 ターン開く間に、外周（リング 2）は 27 で閉鎖される
    for (let seed = 0; seed < 200; seed++) {
      const room = chooseExitRoom(d, d.start, 22, null, createRng(seed))!;
      expect(ringOf(d.rooms[room], d.size)).toBeLessThan(2);
    }
  });

  it('still opens late in the floor, when only the centre room is safe', () => {
    const d = generateDungeon(createRng(4), 1);
    const centre = d.rooms.find((r) => ringOf(r, d.size) === 0)!.index;
    // 階ターン 46：中央以外はすべて閉鎖。プレイヤーが中央にいても、脱出口は開く
    expect(chooseExitRoom(d, centre, 46, null, createRng(1))).toBe(centre);
    // 直前の部屋が中央でも開く
    expect(chooseExitRoom(d, d.start, 46, centre, createRng(1))).toBe(centre);
    // 全部屋が閉鎖されたら開かない
    expect(chooseExitRoom(d, d.start, 65, null, createRng(1))).toBeNull();
  });

  it('retries on later turns of the window when no room was available', () => {
    const d = generateDungeon(createRng(4), 1);
    // 階ターン 70 は全部屋が閉鎖（開けない）。この状態は何ターンたっても変わらない
    expect(stepExit(initialExit(), d, d.start, 70, createRng(1))).toEqual({ exit: initialExit(), event: null });
    // 窓の途中（階ターン 11）でも、まだ開いていなければ開く
    const late = stepExit(initialExit(), d, d.start, 11, createRng(1));
    expect(late.event).toBe('opened');
  });

  it('closes at the end of the window and remembers the room', () => {
    const d = generateDungeon(createRng(4), 1);
    const open = { room: 7, open: true, discovered: true, last: null };
    expect(stepExit(open, d, d.start, 17, createRng(1))).toEqual({ exit: open, event: null });
    expect(stepExit(open, d, d.start, 18, createRng(1))).toEqual({ exit: { room: null, open: false, discovered: false, last: 7 }, event: 'closed' });
  });

  it('is discovered from the room itself or a neighbour', () => {
    const d = generateDungeon(createRng(4), 1);
    const pos = d.start;
    const near = neighbors(d, pos)[0];
    const far = d.rooms.find((r) => r.index !== pos && !neighbors(d, pos).includes(r.index))!.index;
    const at = (room: number) => ({ room, open: true, discovered: false, last: null });
    expect(discoverExit(at(near), d, pos).discovered).toBe(true);
    expect(discoverExit(at(pos), d, pos).discovered).toBe(true);
    expect(discoverExit(at(far), d, pos).discovered).toBe(false);
    expect(discoverExit(initialExit(), d, pos)).toEqual(initialExit());
  });

  it('reports the remaining turns for the header', () => {
    expect(exitStatus({ room: 3, open: true, discovered: false, last: null }, 12)).toEqual({ open: true, turnsLeft: 6 });
    expect(exitStatus(initialExit(), 5)).toEqual({ open: false, turnsLeft: 5 });
    // 開くはずの周期に開けなかった場合は、次の周期までのターン数
    expect(exitStatus(initialExit(), 12)).toEqual({ open: false, turnsLeft: 6 + EXIT_CLOSED_LENGTH });
  });
});
