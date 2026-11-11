# 階層と隠れた脱出口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1 回の潜入で地下 3 階まで降りられるようにする。脱出口は各階に 1 つで、隠れていて開閉する。基準プレイのボットで階ごとのクリア率を測り、目標（地下 1 階 50%・2 階 40%・3 階 30%）に合わせる。

**Architecture:** 脱出口の開閉は新しい `src/core/exit.ts` の純粋な関数にする。`dungeon.ts` は階（depth）に応じて階段とモンスターを配置する。`monsters.ts` は階に応じた強化を行う。`raid.ts` は `floor`・`floorTurn`・`exit` を持ち、`descend()` を追加する。クリア率は、テスト用のボット（`tests/sim/`）が潜入を最後まで自動で進めて測り、回帰テストにする。

**Tech Stack:** TypeScript 5.9 / Vite / Vitest / 素の DOM

**Spec:** `docs/superpowers/specs/2026-11-11-floors-and-hidden-exits-design.md`

**コミット：** ユーザーが指示したときだけコミットする。各タスクにコミット手順は書いていない。

**途中の状態について：**
- Task 1 でトロルを追加した時点から、古い `tests/core/balance.test.ts`（全モンスターに HP 満タンで勝てる、など）が失敗する。Task 8 で置き換えるまで失敗してよい。
- Task 2（dungeon）で `generateDungeon` の引数が変わるため、Task 4（raid）が終わるまで `tests/core/raid.test.ts`・`town.test.ts` などが失敗し、Task 6（UI）が終わるまで `npm run typecheck` が失敗する。
- 各タスクの「Expected」は、そのタスクで触ったテストファイルについて書いている。

---

## 仕様からの補足（計画で決めたこと）

- `Dungeon` の階の番号は、部屋の床のアイテム（`Room.floor`）と名前が紛らわしいので `depth` と呼ぶ。`RaidState` 側は `floor` と呼ぶ。
- モンスターが落とす金貨の階倍率は、`scaledMonster()` の `gold` に掛けて表現する。そのため `rollMonsterDrops` の引数は変えない。
- 脱出口が開く周期の最初の階ターンに、開ける部屋が無かった場合、その周期は開かない（同じ周期の途中で開き直さない）。
- 画面上部の脱出口の残りターンは、開くはずだった周期に開けなかった場合も含めて正しく出す（`exitStatus()`）。

## ファイル構成

| ファイル | 変更 | 役割 |
|---|---|---|
| `src/core/monsters.ts` | 変更 | トロル、階の出現リスト、階による強化 |
| `src/core/dungeon.ts` | 変更 | `depth`、階段、`exit` の部屋の種類の廃止 |
| `src/core/exit.ts` | 新規 | 脱出口の開閉サイクル、開く部屋の選び方、発見、表示用の状態 |
| `src/core/raid.ts` | 変更 | `floor`・`floorTurn`・`exit`、`descend()`、時間経過に rng を渡す |
| `src/core/loot.ts` | 変更 | `rollChest(rng, floor)` |
| `src/ui/screens.ts` / `src/ui/app.ts` | 変更 | 見出し、階段、脱出口の表示、マップの 🌀 と 🪜、到達階 |
| `tests/sim/bot.ts` / `tests/sim/loadouts.ts` | 新規 | 基準プレイのボットと、想定する装備 |
| `tests/core/*.test.ts` / `tests/sim/bot.test.ts` | 新規・変更 | 各タスク |

---

### Task 1: モンスター（トロル、出現リスト、階による強化）

**Files:**
- Modify: `src/core/monsters.ts`
- Test: `tests/core/monsters.test.ts`（新規）

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/monsters.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { FLOOR_SCALING, getMonster, monstersForFloor, scaledMonster } from '../../src/core/monsters';

describe('monsters by floor', () => {
  it('adds stronger monsters to deeper floors', () => {
    expect(monstersForFloor(1)).toEqual(['rat', 'goblin', 'skeleton']);
    expect(monstersForFloor(2)).toEqual(['rat', 'goblin', 'skeleton', 'ghoul']);
    expect(monstersForFloor(3)).toEqual(['rat', 'goblin', 'skeleton', 'ghoul', 'troll']);
    expect(() => monstersForFloor(4)).toThrow();
  });

  it('defines the troll', () => {
    expect(getMonster('troll')).toMatchObject({ name: 'トロル', icon: '🧌', maxHp: 50, defense: 2 });
  });

  it('floor 1 keeps the base stats', () => {
    const ghoul = getMonster('ghoul');
    expect(scaledMonster(ghoul, 1)).toEqual(ghoul);
  });

  it('scales HP, damage and gold with depth', () => {
    const base = getMonster('ghoul');
    for (const floor of [2, 3]) {
      const s = scaledMonster(base, floor);
      const scale = FLOOR_SCALING[floor - 1];
      expect(s.maxHp).toBe(Math.ceil(base.maxHp * scale.hp));
      expect(s.weapon.dice.bonus).toBe(base.weapon.dice.bonus + scale.damage);
      expect(s.weapon.dice.count).toBe(base.weapon.dice.count);
      expect(s.gold).toEqual([base.gold[0] * floor, base.gold[1] * floor]);
    }
    expect(base.maxHp).toBe(getMonster('ghoul').maxHp);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/monsters.test.ts`
Expected: FAIL（`monstersForFloor` などが export されていない）

- [ ] **Step 3: 実装する**

`src/core/monsters.ts` の `DEFS` 配列で、屍食鬼の定義の後（配列の最後）に追加する：

```ts
  { id: 'troll', name: 'トロル', icon: '🧌', maxHp: 50, defense: 2, evasion: 0, weapon: { dice: dice(2, 6, 2), cooldown: 2.4, staminaCost: 0 },
    drops: [{ defId: 'big_pack', chance: 0.05 }, { defId: 'chain_mail', chance: 0.1 }, { defId: 'gold_idol', chance: 0.15 }], gold: [20, 50] },
```

ファイルの末尾に追加する：

```ts
/** 階ごとの出現リスト（index 0 が地下 1 階） */
const FLOOR_MONSTERS: readonly (readonly string[])[] = [
  ['rat', 'goblin', 'skeleton'],
  ['rat', 'goblin', 'skeleton', 'ghoul'],
  ['rat', 'goblin', 'skeleton', 'ghoul', 'troll'],
];

/** 階ごとの強化（index 0 が地下 1 階）。hp は倍率、damage は武器ダイスの修正値に足す値 */
export const FLOOR_SCALING: readonly { hp: number; damage: number }[] = [
  { hp: 1, damage: 0 },
  { hp: 1.3, damage: 1 },
  { hp: 1.6, damage: 2 },
];

export function monstersForFloor(floor: number): readonly string[] {
  const list = FLOOR_MONSTERS[floor - 1];
  if (!list) throw new Error(`no monsters for floor ${floor}`);
  return list;
}

/** 階に応じて強化したモンスター（HP・武器ダメージ・落とす金貨） */
export function scaledMonster(m: MonsterDef, floor: number): MonsterDef {
  const scale = FLOOR_SCALING[floor - 1];
  if (!scale) throw new Error(`no scaling for floor ${floor}`);
  if (floor === 1) return m;
  return {
    ...m,
    maxHp: Math.ceil(m.maxHp * scale.hp),
    weapon: { ...m.weapon, dice: { ...m.weapon.dice, bonus: m.weapon.dice.bonus + scale.damage } },
    gold: [m.gold[0] * floor, m.gold[1] * floor],
  };
}
```

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/monsters.test.ts tests/core/loot.test.ts`
Expected: PASS（loot のテストは、トロルのドロップ ID が存在することも確認する）

---

### Task 2: ダンジョン（階の深さと階段）

**Files:**
- Modify: `src/core/dungeon.ts`
- Test: `tests/core/dungeon.test.ts`（全体を置き換える）

- [ ] **Step 1: テストを置き換える**

`tests/core/dungeon.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  DUNGEON_SIZE, MAX_FLOOR, STAIRS_MIN_DISTANCE, generateDungeon, isClosed, neighbors, ringOf, roomHint, turnsUntilClosed,
} from '../../src/core/dungeon';
import { monstersForFloor } from '../../src/core/monsters';
import { createRng } from '../../src/core/rng';

const gen = (seed: number, depth = 1) => generateDungeon(createRng(seed), depth);

describe('dungeon', () => {
  it('creates a 5x5 map for the given depth', () => {
    const d = gen(1, 2);
    expect(d.size).toBe(DUNGEON_SIZE);
    expect(d.rooms).toHaveLength(25);
    expect(d.depth).toBe(2);
  });

  it('every room is reachable from the start', () => {
    for (let seed = 0; seed < 20; seed++) {
      const d = gen(seed);
      const seen = new Set([d.start]);
      const queue = [d.start];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const n of neighbors(d, cur)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
      expect(seen.size).toBe(25);
    }
  });

  it('links only connect orthogonal neighbours', () => {
    const d = gen(3);
    for (const [a, b] of d.links) {
      const ra = d.rooms[a];
      const rb = d.rooms[b];
      expect(Math.abs(ra.x - rb.x) + Math.abs(ra.y - rb.y)).toBe(1);
    }
  });

  it('places the expected room types for each depth', () => {
    for (const depth of [1, 2, 3]) {
      for (let seed = 0; seed < 10; seed++) {
        const d = gen(seed, depth);
        const count = (type: string) => d.rooms.filter((r) => r.type === type).length;
        expect(count('monster')).toBe(8);
        expect(count('chest')).toBe(5);
        expect(count('trap')).toBe(3);
        expect(count('spring')).toBe(1);
        expect(count('stairs')).toBe(depth < MAX_FLOOR ? 1 : 0);
        expect(d.stairs === null ? 0 : 1).toBe(depth < MAX_FLOOR ? 1 : 0);
        if (d.stairs !== null) expect(d.rooms[d.stairs].type).toBe('stairs');
        expect(d.rooms[d.start].type).toBe('empty');
        expect(ringOf(d.rooms[d.start], d.size)).toBe(2);
        for (const r of d.rooms.filter((x) => x.type === 'monster')) expect(monstersForFloor(depth)).toContain(r.monsterId);
      }
    }
  });

  it('puts the stairs away from the start', () => {
    for (let seed = 0; seed < 30; seed++) {
      const d = gen(seed, 1);
      const s = d.rooms[d.start];
      const st = d.rooms[d.stairs!];
      expect(Math.abs(s.x - st.x) + Math.abs(s.y - st.y)).toBeGreaterThanOrEqual(STAIRS_MIN_DISTANCE);
    }
  });

  it('hints at stairs from a neighbouring room', () => {
    const d = gen(1, 1);
    expect(roomHint(d.rooms[d.stairs!])).toBe('下から風が吹き上がる');
  });

  it('starts with only the start room visited', () => {
    const d = gen(5);
    expect(d.rooms.filter((r) => r.visited).map((r) => r.index)).toEqual([d.start]);
  });

  it('is deterministic for the same seed', () => {
    expect(JSON.stringify(gen(8, 2))).toBe(JSON.stringify(gen(8, 2)));
  });

  it('closes rings according to the miasma schedule', () => {
    const d = gen(1);
    const outer = d.rooms.find((r) => ringOf(r, d.size) === 2)!;
    const center = d.rooms[12];
    expect(isClosed(outer, d.size, 29)).toBe(false);
    expect(isClosed(outer, d.size, 30)).toBe(true);
    expect(isClosed(center, d.size, 59)).toBe(false);
    expect(isClosed(center, d.size, 60)).toBe(true);
    expect(turnsUntilClosed(outer, d.size, 25)).toBe(5);
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/dungeon.test.ts`
Expected: FAIL（`MAX_FLOOR` などが無い、`stairs` が無い）

- [ ] **Step 3: dungeon.ts を変更する**

import に追加する：

```ts
import { monstersForFloor } from './monsters';
```

`RoomType` を置き換える：

```ts
export type RoomType = 'empty' | 'monster' | 'chest' | 'trap' | 'spring' | 'stairs';
```

`Dungeon` を置き換える：

```ts
export interface Dungeon {
  /** 地下何階か（1〜MAX_FLOOR） */
  depth: number;
  size: number;
  rooms: Room[];
  links: [number, number][];
  start: number;
  /** 下り階段の部屋。最下層では null */
  stairs: number | null;
}
```

定数 `EXIT_COUNT` と `EXIT_OPEN_TURN` を削除し、代わりに追加する：

```ts
export const MAX_FLOOR = 3;
export const STAIRS_MIN_DISTANCE = 3;
```

関数 `isExitOpen` を削除する。

`generateDungeon` の宣言を `export function generateDungeon(rng: Rng, depth: number): Dungeon {` に変え、関数の中の「`const s = rooms[start];` から `rooms[start].cleared = true;` の直前まで」（脱出口の選択と部屋の割り当て）を次に置き換える：

```ts
  const s = rooms[start];
  let stairs: number | null = null;
  if (depth < MAX_FLOOR) {
    const far = rooms.filter((r) => Math.abs(r.x - s.x) + Math.abs(r.y - s.y) >= STAIRS_MIN_DISTANCE);
    stairs = rng.pick(far).index;
    rooms[stairs].type = 'stairs';
  }

  const monsterIds = monstersForFloor(depth);
  const rest = rng.shuffle(rooms.filter((r) => r.index !== start && r.index !== stairs));
  let cursor = 0;
  for (const [type, count] of ROOM_PLAN) {
    for (let i = 0; i < count; i++) {
      const room = rest[cursor++];
      room.type = type;
      if (type === 'monster') room.monsterId = rng.pick(monsterIds);
    }
  }

```

関数末尾の `return { size, rooms, links, start, exits };` を `return { depth, size, rooms, links, start, stairs };` に変える。

`roomHint` の `case 'exit': return '冷たい風';` を `case 'stairs': return '下から風が吹き上がる';` に変える。

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/dungeon.test.ts tests/core/monsters.test.ts`
Expected: PASS（`raid.test.ts` などは Task 4 まで失敗してよい）

---

### Task 3: 脱出口の開閉（exit.ts）

**Files:**
- Create: `src/core/exit.ts`
- Test: `tests/core/exit.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/exit.test.ts`：

```ts
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

  it('opens only on the first turn of an open window', () => {
    const d = generateDungeon(createRng(4), 1);
    const opened = stepExit(initialExit(), d, d.start, 10, createRng(1));
    expect(opened.event).toBe('opened');
    expect(opened.exit.open).toBe(true);
    expect(opened.exit.room).not.toBe(d.start);
    const missed = stepExit(initialExit(), d, d.start, 11, createRng(1));
    expect(missed).toEqual({ exit: initialExit(), event: null });
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
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/exit.test.ts`
Expected: FAIL（`Cannot find module '../../src/core/exit'`）

- [ ] **Step 3: 実装する**

`src/core/exit.ts`：

```ts
import { type Dungeon, isClosed, neighbors } from './dungeon';
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

/** 脱出口を開く部屋を選ぶ。今いる部屋・階段・直前の部屋・瘴気で閉鎖された部屋は除く */
export function chooseExitRoom(d: Dungeon, pos: number, floorTurn: number, last: number | null, rng: Rng): number | null {
  const candidates = d.rooms
    .filter((r) => r.index !== pos && r.index !== d.stairs && r.index !== last && !isClosed(r, d.size, floorTurn))
    .map((r) => r.index);
  return candidates.length > 0 ? rng.pick(candidates) : null;
}

/** 階ターンが 1 進んだときの脱出口の変化 */
export function stepExit(exit: ExitState, d: Dungeon, pos: number, floorTurn: number, rng: Rng): { exit: ExitState; event: 'opened' | 'closed' | null } {
  const phase = exitPhase(floorTurn);
  if (exit.open && !phase.open) {
    return { exit: { room: null, open: false, discovered: false, last: exit.room }, event: 'closed' };
  }
  if (!exit.open && phase.open && phase.turnsLeft === EXIT_OPEN_LENGTH) {
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
```

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/exit.test.ts`
Expected: PASS（6 tests）

---

### Task 4: 潜入（階、階ターン、脱出口、階段）

**Files:**
- Modify: `src/core/raid.ts`
- Modify: `tests/core/raid.test.ts`

- [ ] **Step 1: raid.test.ts を更新する**

先頭の import 2 行（`dungeon` と `raid` の import）を次に置き換える：

```ts
import { type Room, MAX_FLOOR, neighbors } from '../../src/core/dungeon';
import { getMonster, scaledMonster } from '../../src/core/monsters';
import {
  type RaidState, DESCEND_TURNS, ESCAPE_TURNS, MIASMA_DAMAGE, RaidError, TRAP_DAMAGE,
  currentRoom, descend, drinkSpring, escape, moveRaidItem, moveTo, openChest, pickUp, startRaid,
} from '../../src/core/raid';
```

（`import { type Adventurer, ... } from '../../src/core/equipment';` などの他の import はそのまま。元の `raid` の import は複数行なので、`import {` から `} from '../../src/core/raid';` までをまとめて置き換える。）

`it('starts at the start room with full HP', ...)` の中の `expect(state.status).toBe('exploring');` の後に追加する：

```ts
    expect(state.floor).toBe(1);
    expect(state.floorTurn).toBe(0);
    expect(state.exit.open).toBe(false);
```

`it('the spring heals half of max HP once', ...)` を次に置き換える：

```ts
  it('the spring heals half of max HP once', () => {
    const { state, rng } = setup();
    const hurt = structuredClone(withRoom(state, state.pos, { type: 'spring', cleared: false }));
    hurt.adventurer.hp = 10;
    const next = drinkSpring(hurt, rng);
    expect(next.adventurer.hp).toBe(35);
    expect(() => drinkSpring(next, rng)).toThrow(RaidError);
  });
```

`it('escapes from an open exit', ...)` からファイル末尾（`});` で閉じる `describe` の直前）までを、次に置き換える：

```ts
  it('escapes from an open exit in the current room', () => {
    const { state, rng } = setup();
    const s = structuredClone(state);
    s.floorTurn = 10;
    s.exit = { room: s.pos, open: true, discovered: true, last: null };
    const next = escape(s, rng);
    expect(next.status).toBe('escaped');
    expect(next.turn).toBe(state.turn + ESCAPE_TURNS);
  });

  it('cannot escape where no exit is open', () => {
    const { state, rng } = setup();
    expect(() => escape(state, rng)).toThrow(RaidError);
    const elsewhere = structuredClone(state);
    elsewhere.floorTurn = 10;
    elsewhere.exit = { room: neighbors(state.dungeon, state.pos)[0], open: true, discovered: true, last: null };
    expect(() => escape(elsewhere, rng)).toThrow(RaidError);
  });

  it('finishes escaping even if the exit closes during the chant', () => {
    const { state, rng } = setup();
    const s = structuredClone(state);
    s.floorTurn = 16;
    s.exit = { room: s.pos, open: true, discovered: true, last: null };
    const next = escape(s, rng);
    expect(next.exit.open).toBe(false);
    expect(next.status).toBe('escaped');
  });

  it('the exit opens somewhere else at floor turn 10', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.floorTurn = 9;
    const next = openChest(s, rng);
    expect(next.floorTurn).toBe(10);
    expect(next.exit.open).toBe(true);
    expect(next.exit.room).not.toBe(next.pos);
    expect(next.exit.room).not.toBe(next.dungeon.stairs);
    expect(next.messages.some((m) => m.includes('どこかで脱出口が開いた'))).toBe(true);
  });

  it('discovers an open exit in a neighbouring room', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.floorTurn = 11;
    s.exit = { room: neighbors(s.dungeon, s.pos)[0], open: true, discovered: false, last: null };
    expect(openChest(s, rng).exit.discovered).toBe(true);
  });

  it('the exit closes after its open window and forgets the discovery', () => {
    const { state, rng } = setup();
    const room = neighbors(state.dungeon, state.pos)[0];
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.floorTurn = 17;
    s.exit = { room, open: true, discovered: true, last: null };
    const next = openChest(s, rng);
    expect(next.exit).toEqual({ room: null, open: false, discovered: false, last: room });
    expect(next.messages.some((m) => m.includes('脱出口が閉じた'))).toBe(true);
  });

  it('reopens in a different room', () => {
    const { state, rng } = setup();
    const room = neighbors(state.dungeon, state.pos)[0];
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.floorTurn = 21;
    s.exit = { room: null, open: false, discovered: false, last: room };
    const next = openChest(s, rng);
    expect(next.exit.open).toBe(true);
    expect(next.exit.room).not.toBe(room);
  });

  it('descends the stairs to a fresh floor', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'stairs' }));
    s.floorTurn = 20;
    const next = descend(s, rng);
    expect(next.floor).toBe(2);
    expect(next.floorTurn).toBe(0);
    expect(next.turn).toBe(state.turn + DESCEND_TURNS);
    expect(next.dungeon.depth).toBe(2);
    expect(next.pos).toBe(next.dungeon.start);
    expect(next.exit.open).toBe(false);
    expect(next.messages.some((m) => m.includes('地下2階に降りた'))).toBe(true);
  });

  it('cannot descend without stairs or below the last floor', () => {
    const { state, rng } = setup();
    expect(() => descend(withRoom(state, state.pos, { type: 'empty' }), rng)).toThrow(RaidError);
    const bottom = structuredClone(withRoom(state, state.pos, { type: 'stairs' }));
    bottom.floor = MAX_FLOOR;
    expect(() => descend(bottom, rng)).toThrow(RaidError);
  });

  it('deeper monsters are scaled up', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const s = structuredClone(withRoom(state, target, { type: 'monster', monsterId: 'rat', cleared: false }));
    s.floor = 3;
    const next = moveTo(s, target, rng);
    expect(next.lastBattle?.result.maxHp[1]).toBe(scaledMonster(getMonster('rat'), 3).maxHp);
  });

  it('miasma damages the adventurer in a closed room', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.floorTurn = 29;
    const next = openChest(s, rng);
    expect(next.floorTurn).toBe(30);
    expect(next.adventurer.hp).toBe(50 - MIASMA_DAMAGE);
  });

  it('miasma can kill', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.floorTurn = 29;
    s.adventurer.hp = 3;
    const next = openChest(s, rng);
    expect(next.status).toBe('dead');
    expect(() => openChest(next, rng)).toThrow(RaidError);
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: FAIL（`descend` が無い、`floor` が undefined など）

- [ ] **Step 3: raid.ts を変更する**

dungeon と monsters の import を次に置き換える：

```ts
import {
  type Dungeon, MAX_FLOOR, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  generateDungeon, isClosed, neighbors,
} from './dungeon';
import { type ExitState, discoverExit, initialExit, stepExit } from './exit';
```

```ts
import { getMonster, scaledMonster } from './monsters';
```

定数に追加する（`ESCAPE_TURNS` の次の行）：

```ts
export const DESCEND_TURNS = 1;
```

`RaidState` を置き換える：

```ts
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
```

`startRaid` を置き換える：

```ts
export function startRaid(adventurer: Adventurer, rng: Rng): RaidState {
  const dungeon = generateDungeon(rng, 1);
  const adv = structuredClone(adventurer);
  adv.hp = computeStats(adv.equipment).maxHp;
  return {
    dungeon, floor: 1, floorTurn: 0, exit: initialExit(), pos: dungeon.start, turn: 0,
    adventurer: adv, status: 'exploring', messages: ['[0] 地下1階に潜入した'], lastBattle: null,
  };
}
```

`advanceTime` を置き換える：

```ts
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
```

`fight()` の `const monster = getMonster(room.monsterId);` を次に置き換える：

```ts
  const monster = scaledMonster(getMonster(room.monsterId), s.floor);
```

`fight()` の最後の `advanceTime(s, BATTLE_TURNS);` を `advanceTime(s, BATTLE_TURNS, rng);` に変える。`moveTo()` の `advanceTime(s, MOVE_TURNS);` を `advanceTime(s, MOVE_TURNS, rng);` に変える。

`openChest()` の `room.floor.push(...rollChest(rng));` を `room.floor.push(...rollChest(rng, s.floor));` に、`advanceTime(s, SEARCH_TURNS);` を `advanceTime(s, SEARCH_TURNS, rng);` に変える。

`drinkSpring` と `escape` を次に置き換え、その後に `descend` を追加する：

```ts
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
```

`MONSTER_IDS` の import が使われなくなったら削除する（`noUnusedLocals` のため）。

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/raid.test.ts tests/core/town.test.ts tests/core/exit.test.ts tests/core/dungeon.test.ts`
Expected: PASS。`loot.test.ts` は Task 5 まで `rollChest` の第 2 引数が無視されるだけで、PASS のまま。

---

### Task 5: 宝箱（階による中身）

**Files:**
- Modify: `src/core/loot.ts`
- Test: `tests/core/loot.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

`tests/core/loot.test.ts` の `describe` の中に追加する：

```ts
  it('deeper chests hold more items and gold', () => {
    for (let seed = 0; seed < 30; seed++) {
      const items = rollChest(createRng(seed), 3);
      const nonGold = items.filter((i) => i.defId !== 'gold');
      expect(nonGold.length).toBeGreaterThanOrEqual(3);
      expect(nonGold.length).toBeLessThanOrEqual(5);
      const gold = items.find((i) => i.defId === 'gold')!;
      expect(gold.qty).toBeGreaterThanOrEqual(15);
      expect(gold.qty).toBeLessThanOrEqual(120);
    }
  });

  it('floor 3 chests favour treasure', () => {
    const share = (floor: number) => {
      let treasure = 0;
      let total = 0;
      for (let seed = 0; seed < 300; seed++) {
        for (const item of rollChest(createRng(seed), floor)) {
          if (item.defId === 'gold') continue;
          total++;
          if (getDef(item.defId).kind === 'treasure') treasure++;
        }
      }
      return treasure / total;
    };
    expect(share(3)).toBeGreaterThan(share(2) * 1.4);
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/loot.test.ts`
Expected: FAIL（中身の数が 1〜3 のまま）

- [ ] **Step 3: 実装する**

`src/core/loot.ts` の import を `import { GOLD_ID, type ItemInstance, createItem, getDef } from './items';` に変え、`rollChest` を置き換える：

```ts
/** 宝箱の中身。深い階ほど数と金貨が増え、地下 3 階では宝物が出やすい */
export function rollChest(rng: Rng, floor = 1): ItemInstance[] {
  const table = floor >= 3
    ? CHEST_TABLE.map((e) => (getDef(e.defId).kind === 'treasure' ? { ...e, weight: e.weight * 2 } : e))
    : CHEST_TABLE;
  const count = rng.int(floor, floor + 2);
  const items = Array.from({ length: count }, () => createItem(weightedPick(table, rng)));
  items.push(createItem(GOLD_ID, rng.int(5 * floor, 40 * floor)));
  return items;
}
```

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/loot.test.ts`
Expected: PASS

---

### Task 6: 画面（見出し、階段、脱出口、到達階）

**Files:**
- Modify: `src/ui/screens.ts`, `src/ui/app.ts`

- [ ] **Step 1: screens.ts の import を変える**

先頭の dungeon の import と raid の import を次に置き換え、exit の import を追加する：

```ts
import {
  MAX_FLOOR, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  isClosed, neighbors, roomHint, turnsUntilClosed,
} from '../core/dungeon';
import { exitStatus } from '../core/exit';
```

```ts
import { DESCEND_TURNS, ESCAPE_TURNS, type RaidState, SEARCH_TURNS, currentRoom } from '../core/raid';
```

- [ ] **Step 2: roomIcon と roomTitle を変える**

`roomIcon` の `case 'exit': return '🌀';` を `case 'stairs': return '🪜';` に、`roomTitle` の `case 'exit': return '脱出口';` を `case 'stairs': return '下り階段';` に変える。

- [ ] **Step 3: renderMap を置き換える**

```ts
function renderMap(raid: RaidState): string {
  const d = raid.dungeon;
  const n = d.size;
  const adjacent = new Set(raid.status === 'exploring' ? neighbors(d, raid.pos) : []);
  const linked = new Set(d.links.map(([a, b]) => `${a}-${b}`));
  const exitRoom = raid.exit.open ? raid.exit.room : null;
  let html = `<div class="map" style="--n:${n * 2 - 1}">`;
  for (let gy = 0; gy < n * 2 - 1; gy++) {
    for (let gx = 0; gx < n * 2 - 1; gx++) {
      if (gx % 2 === 0 && gy % 2 === 0) {
        const room = d.rooms[(gy / 2) * n + gx / 2];
        const classes = ['room'];
        if (room.visited) classes.push('visited');
        if (room.index === raid.pos) classes.push('current');
        if (adjacent.has(room.index)) classes.push('adjacent');
        if (isClosed(room, n, raid.floorTurn)) classes.push('closed');
        else if ((turnsUntilClosed(room, n, raid.floorTurn) ?? Infinity) <= MIASMA_WARNING) classes.push('warn');
        let icon = '?';
        if (room.index === raid.pos) icon = '🧙';
        else if (room.index === exitRoom && raid.exit.discovered) icon = '🌀';
        else if (room.visited) icon = roomIcon(room);
        let hint = '';
        if (adjacent.has(room.index) && room.index === exitRoom) hint = '青い光が漏れている';
        else if (adjacent.has(room.index) && !room.visited) hint = roomHint(room);
        const attrs = adjacent.has(room.index) ? ` data-action="move" data-room="${room.index}"` : '';
        html += `<div class="${classes.join(' ')}"${attrs}${hint ? ` data-tip="${esc(hint)}"` : ''}>${icon}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
      } else if (gx % 2 === 1 && gy % 2 === 0) {
        const a = (gy / 2) * n + (gx - 1) / 2;
        html += `<div class="link h${linked.has(`${a}-${a + 1}`) ? ' on' : ''}"></div>`;
      } else if (gx % 2 === 0 && gy % 2 === 1) {
        const a = ((gy - 1) / 2) * n + gx / 2;
        html += `<div class="link v${linked.has(`${a}-${a + n}`) ? ' on' : ''}"></div>`;
      } else {
        html += '<div></div>';
      }
    }
  }
  return `${html}</div>`;
}
```

- [ ] **Step 4: renderRaid の前半（`const floor = room.floor` の行より前）と見出しを置き換える**

`renderRaid` 関数の先頭から `const floor = room.floor` の直前までを次に置き換える：

```ts
export function renderRaid(raid: RaidState, selectedUid: string | null): string {
  const stats = computeStats(raid.adventurer.equipment);
  const room = currentRoom(raid);
  const nextMiasma = MIASMA_SCHEDULE.find((s) => s.turn > raid.floorTurn);
  const exit = exitStatus(raid.exit, raid.floorTurn);
  const atExit = raid.exit.open && raid.exit.room === raid.pos;
  const actions: string[] = [];
  if (room.type === 'chest' && !room.cleared) actions.push(`<button data-action="open-chest">宝箱を開ける（${SEARCH_TURNS}ターン）</button>`);
  if (room.type === 'spring' && !room.cleared) actions.push(`<button data-action="drink">泉の水を飲む（${SEARCH_TURNS}ターン）</button>`);
  if (room.type === 'stairs' && raid.floor < MAX_FLOOR) actions.push(`<button class="primary" data-action="descend">階段を降りる（${DESCEND_TURNS}ターン）</button>`);
  if (atExit) actions.push(`<button class="primary" data-action="escape">脱出する（${ESCAPE_TURNS}ターン）</button>`);
```

同じ関数の `return` の見出し部分（`<header><h1>浅層</h1>` から `</div></header>` まで）を次に置き換える：

```ts
  return `<header><h1>地下${raid.floor}階</h1>
    <div>HP <b>${raid.adventurer.hp}/${stats.maxHp}</b> / ターン ${raid.turn}
      / ${nextMiasma ? `瘴気まで あと${nextMiasma.turn - raid.floorTurn}ターン` : '瘴気: 全域'}
      / 脱出口: ${exit.open ? `開いている（あと${exit.turnsLeft}ターンで閉じる）` : `閉じている（あと${exit.turnsLeft}ターンで開く）`}</div></header>
```

さらに、部屋の見出し `<h2>${esc(roomTitle(room))}</h2>` を次に変える：

```ts
<h2>${esc(roomTitle(room))}${atExit ? '（脱出口が開いている🌀）' : ''}</h2>
```

（`exitOpen` と `EXIT_OPEN_TURN` を使っていた古い行は、すべてこの置き換えで無くなる。）

- [ ] **Step 5: renderResult に到達階を出す**

`renderResult` の `<section>${body}` を `<section><p>地下${raid.floor}階まで到達</p>${body}` に変える。

- [ ] **Step 6: app.ts を変える**

`import { type RaidState, currentRoom, drinkSpring, equipRaidItem, escape, moveRaidItem, moveTo, openChest, pickUp } from '../core/raid';` を次に置き換える：

```ts
import { type RaidState, currentRoom, descend, drinkSpring, equipRaidItem, escape, moveRaidItem, moveTo, openChest, pickUp } from '../core/raid';
```

`handle()` の `case 'drink':` と `case 'escape':` を次に置き換え、`case 'descend':` を追加する：

```ts
      case 'drink':
        return this.afterRaidAction(drinkSpring(this.raid(), this.rng));
      case 'escape':
        return this.afterRaidAction(escape(this.raid(), this.rng));
      case 'descend':
        return this.afterRaidAction(descend(this.raid(), this.rng));
```

- [ ] **Step 7: 型チェック、テスト、ビルド**

Run: `npm run typecheck && npm test && npm run build`
Expected: 型エラーなし。`tests/core/balance.test.ts`（シーケンサーの時の「HP 半分の屍食鬼」など）は、屍食鬼が地下 2 階以降になったため失敗してよい。それ以外は PASS。balance のテストは Task 8 で置き換える。

---

### Task 7: 基準プレイのボット

**Files:**
- Create: `tests/sim/loadouts.ts`, `tests/sim/bot.ts`
- Test: `tests/sim/bot.test.ts`

仕様書 §7.2（想定する装備）と §7.3（基準プレイ）をコードにする。

- [ ] **Step 1: 想定する装備**

`tests/sim/loadouts.ts`：

```ts
import { type Adventurer, createAdventurer } from '../../src/core/equipment';
import { createGrid, placeItem } from '../../src/core/grid';
import { createItem } from '../../src/core/items';

/** 初期装備：何も持たない（潜入時のボロ装備だけになる） */
export function starterLoadout(): Adventurer {
  return createAdventurer();
}

/** 最低限の武器と防具 */
export function basicLoadout(): Adventurer {
  return {
    ...createAdventurer(),
    equipment: { rightHand: createItem('short_sword'), body: createItem('leather_armor'), head: createItem('leather_cap') },
  };
}

/** フル装備＋バッグの戦闘道具 */
export function fullLoadout(): Adventurer {
  let bagGrid = createGrid(5, 4);
  bagGrid = placeItem(bagGrid, createItem('whetstone'), 0, 0, 0); // 列 0、行 0〜1
  bagGrid = placeItem(bagGrid, createItem('guard_cloth'), 1, 0, 0); // 列 1〜2、行 0
  bagGrid = placeItem(bagGrid, createItem('throwing_knife'), 3, 0, 0);
  bagGrid = placeItem(bagGrid, createItem('throwing_knife'), 4, 0, 0);
  bagGrid = placeItem(bagGrid, createItem('bomb'), 1, 1, 0);
  bagGrid = placeItem(bagGrid, createItem('herb'), 2, 1, 0);
  return {
    ...createAdventurer(),
    equipment: {
      rightHand: createItem('short_sword'), leftHand: createItem('dagger'), head: createItem('leather_cap'),
      body: createItem('chain_mail'), legs: createItem('leather_pants'), feet: createItem('boots'),
      hands: createItem('gloves'), arms: createItem('bracers'), belt: createItem('leather_belt'),
      ring1: createItem('ring_guard'), ring2: createItem('ring_vigor'), neck: createItem('amulet_life'),
    },
    consumables: [createItem('potion'), createItem('potion'), createItem('potion')],
    bag: createItem('leather_pack'),
    bagGrid,
  };
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/sim/bot.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { startRaid } from '../../src/core/raid';
import { createRng } from '../../src/core/rng';
import { withFreeKit } from '../../src/core/town';
import { clearRate, playRaid } from './bot';
import { fullLoadout, starterLoadout } from './loadouts';

describe('reference bot', () => {
  it('always finishes a raid (escaped or dead)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const end = playRaid(startRaid(withFreeKit(starterLoadout()), rng), 1, rng);
      expect(end.status).not.toBe('exploring');
    }
  });

  it('only escapes from the target floor', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const end = playRaid(startRaid(withFreeKit(fullLoadout()), rng), 2, rng);
      if (end.status === 'escaped') expect(end.floor).toBe(2);
    }
  });

  it('a well-equipped bot clears floor 1 most of the time', () => {
    expect(clearRate(fullLoadout, 1, 30)).toBeGreaterThan(0.5);
  }, 60_000);
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `npx vitest run tests/sim/bot.test.ts`
Expected: FAIL（`Cannot find module './bot'`）

- [ ] **Step 4: ボットを実装する**

`tests/sim/bot.ts`：

```ts
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
```

- [ ] **Step 5: テストを通す**

Run: `npx vitest run tests/sim/bot.test.ts && npm run typecheck`
Expected: PASS。型エラーなし。

---

### Task 8: クリア率の回帰テストと難易度の調整

**Files:**
- Test: `tests/core/balance.test.ts`（全体を置き換える）
- Modify（調整）: `src/core/monsters.ts`、`src/core/raid.ts`、`src/core/exit.ts`、`src/core/dungeon.ts`

- [ ] **Step 1: balance.test.ts を置き換える**

```ts
import { describe, expect, it } from 'vitest';
import { clearRate } from '../sim/bot';
import { basicLoadout, fullLoadout, starterLoadout } from '../sim/loadouts';

describe('clear rates with the reference bot (300 raids each)', () => {
  it('地下1階：初期装備で 40〜60%', () => {
    const rate = clearRate(starterLoadout, 1);
    expect(rate, `rate=${rate}`).toBeGreaterThanOrEqual(0.4);
    expect(rate, `rate=${rate}`).toBeLessThanOrEqual(0.6);
  }, 120_000);

  it('地下2階：最低限の武器と防具で 30〜50%', () => {
    const rate = clearRate(basicLoadout, 2);
    expect(rate, `rate=${rate}`).toBeGreaterThanOrEqual(0.3);
    expect(rate, `rate=${rate}`).toBeLessThanOrEqual(0.5);
  }, 120_000);

  it('地下3階：フル装備＋バッグの戦闘道具で 20〜40%', () => {
    const rate = clearRate(fullLoadout, 3);
    expect(rate, `rate=${rate}`).toBeGreaterThanOrEqual(0.2);
    expect(rate, `rate=${rate}`).toBeLessThanOrEqual(0.4);
  }, 120_000);
});
```

- [ ] **Step 2: 測る**

Run: `npx vitest run tests/core/balance.test.ts`

失敗メッセージの `rate=…` で、3 つのクリア率がわかる。

- [ ] **Step 3: 目標に入るまで調整する**

浅い階から順に調整する。深い階の数値は浅い階のクリア率に影響しないので、この順なら手戻りが少ない。

1. **地下 1 階（初期装備、40〜60%）**：次の数値を使う。
   - 浅い階のモンスター（`rat`・`goblin`・`skeleton`）の `maxHp` と武器ダイスの修正値（`src/core/monsters.ts`）
   - `TRAP_DAMAGE`・`MIASMA_DAMAGE`（`src/core/raid.ts`）
   - `EXIT_FIRST_OPEN`・`EXIT_OPEN_LENGTH`・`EXIT_CLOSED_LENGTH`（`src/core/exit.ts`）
   - `MIASMA_SCHEDULE`（`src/core/dungeon.ts`）
2. **地下 2 階（最低限の装備、30〜50%）**：地下 1 階の数値は動かさず、`FLOOR_SCALING[1]` と `ghoul` の基準値で調整する。
3. **地下 3 階（フル装備、20〜40%）**：地下 1・2 階の数値は動かさず、`FLOOR_SCALING[2]` と `troll` の基準値で調整する。

ルール：
- 1 回に変える数値は 1〜2 個にし、変えるたびに 3 つすべてを測り直す。
- ダイスの修正値は整数、HP は整数、倍率は 0.1 刻みで変える。
- 他のテスト（`raid.test.ts` の「ネズミに勝つ」など）が数値の変更で失敗した場合は、テストを弱めない。テスト側の装備を強くするなど、テストの意図を保つ形で直し、何を変えたかを記録する。
- 3 つとも範囲に入ったら、最終的な数値と 3 つのクリア率を記録する。

- [ ] **Step 4: 全体を確認する**

Run: `npm test && npm run typecheck && npm run build`
Expected: すべて成功する。

---

### Task 9: 仕様書の数値の更新と手動確認

**Files:**
- Modify: `docs/superpowers/specs/2026-11-11-floors-and-hidden-exits-design.md`

- [ ] **Step 1: 仕様書を実際の数値に合わせる**

Task 8 で変えた数値（モンスターの基準値、`FLOOR_SCALING`、罠・瘴気、脱出口の開閉の長さ）を、仕様書の §3.1・§4.1・§5 の表と文に反映する。§7.1 の下に、測ったクリア率を 1 行ずつ追記する（例：`- 実測（基準プレイ、300 回）：地下 1 階 52%、地下 2 階 41%、地下 3 階 29%`）。

- [ ] **Step 2: ブラウザで確認する**

Run: `npm run dev`（`http://localhost:5173/`）

1. 潜入すると、見出しが「地下1階」になる。画面上部に「脱出口：閉じている（あと10ターンで開く）」と出る。
2. 10 階ターン目に「どこかで脱出口が開いた」とログに出る。マップには 🌀 が出ない。
3. 脱出口の隣の部屋に行くと、その部屋に「青い光が漏れている」と出て、マップに 🌀 が表示される。
4. 8 ターン後に「脱出口が閉じた」と出て、🌀 が消える。4 ターン後に別の部屋で開く。
5. 階段の部屋（🪜）で「階段を降りる」を押すと、見出しが「地下2階」になり、瘴気と脱出口の残りターンがリセットされる。
6. 地下 3 階には階段が無い。
7. 脱出すると、結果画面に「地下N階まで到達」と出る。

---

## 仕様書との対応

| 仕様書 | タスク |
|---|---|
| §2 階層（3 階、階段、一方通行、階ターン） | 2、4 |
| §2.1 部屋の割り当て | 2 |
| §3.1 モンスターの出現と強化、トロル | 1、4 |
| §3.2 宝箱 | 5 |
| §4.1 開閉のサイクルと開く部屋の条件 | 3、4 |
| §4.2 見つけ方 | 3、4、6 |
| §4.3 詠唱中に閉じても脱出 | 4 |
| §4.4・§6 表示 | 6 |
| §5 瘴気は階ターン | 4 |
| §7 難易度の目標と基準プレイ | 7、8 |
