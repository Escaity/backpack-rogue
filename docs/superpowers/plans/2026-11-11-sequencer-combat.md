# シーケンサー戦闘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** バッグの列を戦闘のタイムラインにする。カーソルが 1 秒ごとに列を進み、CT が明けた戦闘道具が発動する。これにより、バッグの配置が戦闘に効くようにする。

**Architecture:** 新しい `src/core/sequencer.ts` が、バッグのグリッドから「どの列にどの道具があるか」を組み立てる。`src/core/combat.ts` の `simulateCombat` は、各ティックでカーソルを進め、道具を発動させる。戦闘結果には道具の残り回数と使い切った道具を返し、`raid.ts` がバッグに反映する。UI は戦闘画面にバッグのミニ表示（カーソル列と発動した道具の強調）を加える。

**Tech Stack:** TypeScript 5.9 / Vite / Vitest / 素の DOM

**Spec:** `docs/superpowers/specs/2026-11-11-sequencer-combat-design.md`

**コミット：** このリポジトリでは、ユーザーが指示したときだけコミットする。各タスクにコミット手順は書いていない。

---

## ファイル構成

| ファイル | 変更 | 役割 |
|---|---|---|
| `src/core/items.ts` | 変更 | `tool` 種別、`ToolEffect`、`charges`、戦闘道具 7 種の定義 |
| `src/core/sequencer.ts` | 新規 | バッグ → 道具の並び（`buildSequence`）、効果の説明文、戦闘後の反映（`applyToolUsage`） |
| `src/core/combat.ts` | 全面置き換え | カーソル、道具の発動、砥石と盾布の効果、結果に残り回数を追加 |
| `src/core/raid.ts` | 変更 | 戦闘前のバッグを保存し、戦闘後に残り回数を反映 |
| `src/core/loot.ts` / `monsters.ts` / `town.ts` | 変更 | 宝箱・ドロップ・商人・無料支給に道具を追加 |
| `src/core/save.ts` | 変更 | `charges` の無い古いセーブを補う |
| `src/ui/views.ts` | 変更 | 道具の説明文、戦闘用のバッグ表示 |
| `src/ui/screens.ts` | 変更 | 戦闘ログとバッグのミニ表示 |
| `src/ui/style.css` | 変更 | カーソル列と発動の強調 |
| `tests/core/*.test.ts` | 新規・変更 | 下記の各タスク |

---

### Task 1: アイテム定義に戦闘道具を追加する

**Files:**
- Modify: `src/core/items.ts`
- Test: `tests/core/items.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

`tests/core/items.test.ts` の `describe('items', () => {` の中、最後の `it` の後に追加する：

```ts
  it('tools have tool stats and limited tools start with full charges', () => {
    for (const def of Object.values(ITEM_DEFS)) {
      if (def.kind === 'tool') expect(def.tool, def.id).toBeDefined();
    }
    expect(createItem('herb').charges).toBe(3);
    expect(createItem('bomb').charges).toBe(1);
    expect(createItem('throwing_knife').charges).toBeNull();
    expect(createItem('black_bread').charges).toBeNull();
    expect(getDef('old_knife').value).toBe(0);
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/items.test.ts`
Expected: FAIL（`herb` が未定義、または `charges` が undefined）

- [ ] **Step 3: items.ts を変更する**

`ItemKind` を置き換える：

```ts
export type ItemKind = 'equipment' | 'consumable' | 'treasure' | 'gold' | 'bag' | 'tool';
```

`ConsumableEffect` の定義の直後に追加する：

```ts
/** 戦闘道具の効果（シーケンサーでカーソルが来たときに発動） */
export type ToolEffect =
  | { kind: 'damage'; dice: Dice }
  | { kind: 'sharpen'; dice: Dice }
  | { kind: 'guard'; amount: number }
  | { kind: 'heal'; dice: Dice }
  | { kind: 'stamina'; amount: number };

export interface ToolStats {
  /** 秒。0 なら CT なし */
  cooldown: number;
  effect: ToolEffect;
  /** 回数制限。無ければ無制限 */
  maxCharges?: number;
}
```

`ItemDef` の `stackMax?: number;` の次の行に追加する：

```ts
  tool?: ToolStats;
```

`ItemInstance` を置き換える：

```ts
export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
  durability: number | null;
  /** 回数制限のある戦闘道具の残り回数。それ以外は null */
  charges: number | null;
}
```

`createItem` を置き換える：

```ts
export function createItem(defId: string, qty = 1): ItemInstance {
  const def = getDef(defId);
  return { uid: newUid(), defId, qty, durability: def.maxDurability ?? null, charges: def.tool?.maxCharges ?? null };
}
```

`DEFS` の `rusty_dagger` 行のアイコンを `'🔪'` から `'🗡️'` に変える。

`DEFS` の `// 宝物` の行の直前に追加する：

```ts
  // 戦闘道具（バッグに置くとシーケンサーで発動）
  { id: 'old_knife', name: '古びた投げナイフ', icon: '🔪', kind: 'tool', shape: rect(1, 1), value: 0, tool: { cooldown: 2, effect: { kind: 'damage', dice: dice(1, 3) } } },
  { id: 'throwing_knife', name: '投げナイフ', icon: '🔪', kind: 'tool', shape: rect(1, 1), value: 10, tool: { cooldown: 2, effect: { kind: 'damage', dice: dice(1, 4) } } },
  { id: 'bomb', name: '爆弾', icon: '💣', kind: 'tool', shape: rect(1, 1), value: 15, tool: { cooldown: 0, effect: { kind: 'damage', dice: dice(2, 6) }, maxCharges: 1 } },
  { id: 'whetstone', name: '砥石', icon: '🪨', kind: 'tool', shape: rect(1, 2), value: 20, tool: { cooldown: 3, effect: { kind: 'sharpen', dice: dice(1, 4) } } },
  { id: 'guard_cloth', name: '盾布', icon: '🧣', kind: 'tool', shape: rect(2, 1), value: 20, tool: { cooldown: 3, effect: { kind: 'guard', amount: 3 } } },
  { id: 'herb', name: '薬草', icon: '🌿', kind: 'tool', shape: rect(1, 1), value: 10, tool: { cooldown: 4, effect: { kind: 'heal', dice: dice(1, 4, 1) }, maxCharges: 3 } },
  { id: 'jerky', name: '干し肉', icon: '🥩', kind: 'tool', shape: rect(1, 1), value: 8, tool: { cooldown: 4, effect: { kind: 'stamina', amount: 3 }, maxCharges: 2 } },
```

- [ ] **Step 4: テストと型チェック**

Run: `npx vitest run tests/core/items.test.ts && npm run typecheck`
Expected: items のテストが PASS。型チェックはエラーなし（`ItemInstance` のオブジェクトリテラルを直接書いている箇所があればここで型エラーになるので、`charges: null` を足して直す）。

---

### Task 2: シーケンサー（バッグ → 道具の並び）

**Files:**
- Create: `src/core/sequencer.ts`
- Test: `tests/core/sequencer.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/sequencer.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { dice } from '../../src/core/dice';
import { createGrid, placeItem } from '../../src/core/grid';
import { createItem } from '../../src/core/items';
import { applyToolUsage, buildSequence, toolEffectText } from '../../src/core/sequencer';

describe('sequencer', () => {
  it('builds entries for tools and bag consumables, ordered top then left', () => {
    const knife = createItem('throwing_knife');
    const stone = createItem('whetstone');
    const potion = createItem('potion');
    let g = createGrid(4, 3);
    g = placeItem(g, potion, 3, 2, 0);
    g = placeItem(g, stone, 0, 1, 1); // 1x2 を回転して横向き（列 0〜1、行 1）
    g = placeItem(g, knife, 2, 0, 0);
    g = placeItem(g, createItem('gem'), 3, 0, 0);
    g = placeItem(g, createItem('dagger'), 2, 1, 0);
    const seq = buildSequence(g);
    expect(seq.map((e) => e.uid)).toEqual([knife.uid, stone.uid, potion.uid]);
    expect(seq[0]).toMatchObject({ cols: [2], top: 0, cooldown: 2, charges: null, label: '🔪投げナイフ' });
    expect(seq[1]).toMatchObject({ cols: [0, 1], top: 1, cooldown: 3 });
    expect(seq[2]).toMatchObject({ cols: [3], cooldown: 0, charges: 1, effect: { kind: 'heal', dice: dice(0, 1, 20) } });
  });

  it('uses the instance charges', () => {
    const herb = { ...createItem('herb'), charges: 2 };
    expect(buildSequence(placeItem(createGrid(2, 2), herb, 0, 0, 0))[0].charges).toBe(2);
  });

  it('applyToolUsage removes spent items and updates charges', () => {
    const herb = createItem('herb');
    const bomb = createItem('bomb');
    const gem = createItem('gem');
    let g = createGrid(3, 1);
    g = placeItem(g, herb, 0, 0, 0);
    g = placeItem(g, bomb, 1, 0, 0);
    g = placeItem(g, gem, 2, 0, 0);
    const next = applyToolUsage(g, { [herb.uid]: 1 }, [bomb.uid]);
    expect(next.placements.map((p) => p.item.uid)).toEqual([herb.uid, gem.uid]);
    expect(next.placements[0].item.charges).toBe(1);
    expect(g.placements).toHaveLength(3);
  });

  it('describes tool effects', () => {
    expect(toolEffectText({ kind: 'damage', dice: dice(1, 4) })).toBe('敵に1d4ダメージ');
    expect(toolEffectText({ kind: 'sharpen', dice: dice(1, 4) })).toBe('次の武器攻撃 +1d4');
    expect(toolEffectText({ kind: 'guard', amount: 3 })).toBe('次に受けるダメージ -3');
    expect(toolEffectText({ kind: 'heal', dice: dice(1, 4, 1) })).toBe('HPを1d4+1回復');
    expect(toolEffectText({ kind: 'stamina', amount: 3 })).toBe('スタミナ +3');
  });
});
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/sequencer.test.ts`
Expected: FAIL（`Cannot find module '../../src/core/sequencer'`）

- [ ] **Step 3: 実装する**

`src/core/sequencer.ts`：

```ts
import { dice, formatDice } from './dice';
import { type Grid, placementCells } from './grid';
import { type ToolEffect, getDef } from './items';

/** シーケンサー上の 1 つの道具。カーソルが cols のいずれかに入ったときに判定される */
export interface SeqEntry {
  uid: string;
  /** 表示名（アイコン＋名前） */
  label: string;
  /** 道具が占める列（昇順、重複なし） */
  cols: number[];
  /** 処理順のための左上座標 */
  top: number;
  left: number;
  cooldown: number;
  effect: ToolEffect;
  /** 残り回数。null は無制限 */
  charges: number | null;
}

/**
 * バッグのグリッドから戦闘道具の並びを作る。
 * - 戦闘道具（kind: 'tool'）はその定義どおり
 * - バッグに置いた消費アイテムは「CT なし・1 回限りの回復」として扱う
 * - それ以外（宝物・金貨・予備装備）は含めない
 * 並びは上の行→左の列の順。
 */
export function buildSequence(grid: Grid): SeqEntry[] {
  const entries: SeqEntry[] = [];
  for (const p of grid.placements) {
    const def = getDef(p.item.defId);
    const cells = placementCells(p);
    const cols = [...new Set(cells.map(([x]) => x))].sort((a, b) => a - b);
    const top = Math.min(...cells.map(([, y]) => y));
    const left = Math.min(...cells.map(([x]) => x));
    const label = `${def.icon}${def.name}`;
    if (def.tool) {
      const charges = p.item.charges ?? def.tool.maxCharges ?? null;
      entries.push({ uid: p.item.uid, label, cols, top, left, cooldown: def.tool.cooldown, effect: def.tool.effect, charges });
    } else if (def.consumable) {
      entries.push({ uid: p.item.uid, label, cols, top, left, cooldown: 0, effect: { kind: 'heal', dice: dice(0, 1, def.consumable.heal) }, charges: 1 });
    }
  }
  return entries.sort((a, b) => a.top - b.top || a.left - b.left);
}

export function toolEffectText(effect: ToolEffect): string {
  switch (effect.kind) {
    case 'damage': return `敵に${formatDice(effect.dice)}ダメージ`;
    case 'sharpen': return `次の武器攻撃 +${formatDice(effect.dice)}`;
    case 'guard': return `次に受けるダメージ -${effect.amount}`;
    case 'heal': return `HPを${formatDice(effect.dice)}回復`;
    case 'stamina': return `スタミナ +${effect.amount}`;
  }
}

/** 戦闘後のバッグに、道具の残り回数と使い切ったアイテムの削除を反映する */
export function applyToolUsage(grid: Grid, charges: Readonly<Record<string, number>>, spent: readonly string[]): Grid {
  return {
    ...grid,
    placements: grid.placements
      .filter((p) => !spent.includes(p.item.uid))
      .map((p) => (p.item.uid in charges ? { ...p, item: { ...p.item, charges: charges[p.item.uid] } } : p)),
  };
}
```

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/sequencer.test.ts`
Expected: PASS（4 tests）

---

### Task 3: 戦闘シミュレーションにシーケンサーを組み込む

**Files:**
- Modify: `src/core/combat.ts`（全体を置き換える）
- Modify: `tests/core/combat.test.ts`（`makeFighter` に新フィールドを追加）
- Test: `tests/core/sequencer-combat.test.ts`

ルール（仕様書 §2）：

- **カーソル**：プレイヤー側の `bagWidth > 0` のとき、整数秒 t（1 以上）に列 `(t - 1) % bagWidth` へ入る。`cursor` イベントを出し、その列にある道具を `sequence` の順に判定する。
- **発動条件**：残り回数が 0 でなく、`t >= readyAt` であること。発動したら `readyAt = t + cooldown` とし、回数制限があれば 1 減らす。`heal` と `stamina` は、満タンなら発動扱いにしない。
- **ティック内の処理順**：スタミナ回復 → 武器 → 定期回復 → シーケンサー → ベルトの消費アイテム。
- **砥石**：次の武器攻撃 1 回にダイスを足す（攻撃が外れても消える）。
- **盾布**：次に当たった攻撃 1 回（武器または `damage` 道具）を軽減する（攻撃が外れたら効果は残る）。疲労ダメージには効かない。

- [ ] **Step 1: 既存テストの `makeFighter` を更新する**

`tests/core/combat.test.ts` の `makeFighter` の返り値に `bagWidth: 0, sequence: [],` を足す：

```ts
function makeFighter(over: Partial<Fighter> = {}): Fighter {
  return {
    name: 'テスト', icon: '🧪', stats: { ...BASE_STATS }, hp: BASE_STATS.maxHp,
    weapons: [{ dice: dice(0, 1, 5), cooldown: 1, staminaCost: 0 }], periodicHeals: [], consumables: [],
    bagWidth: 0, sequence: [], ...over,
  };
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/core/sequencer-combat.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { type CombatEvent, type CombatResult, type Fighter, simulateCombat } from '../../src/core/combat';
import { dice } from '../../src/core/dice';
import { BASE_STATS } from '../../src/core/equipment';
import type { ToolEffect } from '../../src/core/items';
import { createRng } from '../../src/core/rng';
import type { SeqEntry } from '../../src/core/sequencer';

function tool(uid: string, cols: number[], cooldown: number, effect: ToolEffect, charges: number | null = null): SeqEntry {
  return { uid, label: `🧪${uid}`, cols, top: 0, left: cols[0], cooldown, effect, charges };
}

function fighter(over: Partial<Fighter> = {}): Fighter {
  return {
    name: 'テスト', icon: '🧪', stats: { ...BASE_STATS }, hp: BASE_STATS.maxHp,
    weapons: [], periodicHeals: [], consumables: [], bagWidth: 0, sequence: [], ...over,
  };
}

/** HP 1000 の頑丈な相手（長時間のタイミング検証用） */
function sturdy(over: Partial<Fighter> = {}): Fighter {
  return fighter({ hp: 1000, stats: { ...BASE_STATS, maxHp: 1000 }, ...over });
}

function usesOf(r: CombatResult, uid: string): CombatEvent[] {
  return r.events.filter((e) => e.actor === 0 && 'uid' in e && e.uid === uid);
}

describe('sequencer combat', () => {
  it('moves the cursor one column per second and wraps around', () => {
    const r = simulateCombat(sturdy({ bagWidth: 4 }), sturdy(), createRng(1));
    const cursor = r.events.filter((e) => e.kind === 'cursor');
    expect(cursor.slice(0, 6).map((e) => [e.t, e.kind === 'cursor' ? e.col : -1])).toEqual([[1, 0], [2, 1], [3, 2], [4, 3], [5, 0], [6, 1]]);
    expect(cursor.every((e) => e.actor === 0)).toBe(true);
  });

  it('a vertical tool misses its chance when the CT is longer than one lap', () => {
    const a = sturdy({ bagWidth: 4, sequence: [tool('v', [0], 5, { kind: 'guard', amount: 1 })] });
    expect(usesOf(simulateCombat(a, sturdy(), createRng(1)), 'v').slice(0, 3).map((e) => e.t)).toEqual([1, 9, 17]);
  });

  it('a horizontal tool catches the next column instead', () => {
    const a = sturdy({ bagWidth: 4, sequence: [tool('h', [0, 1], 5, { kind: 'guard', amount: 1 })] });
    expect(usesOf(simulateCombat(a, sturdy(), createRng(1)), 'h').slice(0, 4).map((e) => e.t)).toEqual([1, 6, 13, 18]);
  });

  it('damage tools roll dice and respect defense and evasion', () => {
    const knife = tool('k', [0], 2, { kind: 'damage', dice: dice(0, 1, 4) });
    const hit = usesOf(simulateCombat(sturdy({ bagWidth: 1, sequence: [knife] }), sturdy({ stats: { ...BASE_STATS, maxHp: 1000, defense: 1 } }), createRng(1)), 'k')[0];
    expect(hit).toMatchObject({ kind: 'toolHit', t: 1, roll: 4, damage: 3, dice: '4' });
    const misses = usesOf(simulateCombat(sturdy({ bagWidth: 1, sequence: [knife] }), sturdy({ stats: { ...BASE_STATS, maxHp: 1000, evasion: 1 } }), createRng(1)), 'k');
    expect(misses.length).toBeGreaterThan(0);
    expect(misses.every((e) => e.kind === 'toolMiss')).toBe(true);
  });

  it('sharpen adds dice to the next weapon attack only', () => {
    const a = sturdy({
      bagWidth: 4,
      weapons: [{ dice: dice(0, 1, 5), cooldown: 1, staminaCost: 0 }],
      sequence: [tool('s', [0], 3, { kind: 'sharpen', dice: dice(0, 1, 3) })],
    });
    const hits = simulateCombat(a, sturdy(), createRng(1)).events.filter((e) => e.kind === 'hit' && e.actor === 0);
    expect(hits.slice(0, 3).map((e) => (e.kind === 'hit' ? [e.t, e.bonus, e.damage] : []))).toEqual([[1, 0, 5], [2, 3, 8], [3, 0, 5]]);
  });

  it('guard reduces the next hit taken, down to zero', () => {
    const a = sturdy({ bagWidth: 4, sequence: [tool('g', [0], 3, { kind: 'guard', amount: 3 })] });
    const strong = sturdy({ weapons: [{ dice: dice(0, 1, 5), cooldown: 1.5, staminaCost: 0 }] });
    const hits = simulateCombat(a, strong, createRng(1)).events.filter((e) => e.kind === 'hit' && e.actor === 1);
    expect(hits.slice(0, 2).map((e) => (e.kind === 'hit' ? [e.t, e.blocked, e.damage] : []))).toEqual([[1.5, 3, 2], [3, 0, 5]]);
    const weak = sturdy({ weapons: [{ dice: dice(0, 1, 2), cooldown: 1.5, staminaCost: 0 }] });
    const first = simulateCombat(a, weak, createRng(1)).events.find((e) => e.kind === 'hit' && e.actor === 1);
    expect(first).toMatchObject({ blocked: 2, damage: 0 });
  });

  // 15 秒以降は疲労で HP が減り、薬草が再び発動してしまう。そこで、3 秒で相手を倒す武器を持たせて戦闘を短く終わらせる
  const finisher = [{ dice: dice(0, 1, 100), cooldown: 3, staminaCost: 0 }];

  it('heal tools wait while HP is full and are spent when charges run out', () => {
    const herb = tool('h', [0], 4, { kind: 'heal', dice: dice(0, 1, 5) }, 3);
    const full = simulateCombat(fighter({ bagWidth: 4, sequence: [herb], weapons: finisher }), fighter(), createRng(1));
    expect(usesOf(full, 'h')).toHaveLength(0);
    expect(full.toolCharges.h).toBeUndefined();
    expect(full.spentItems).toEqual([]);
    const hurt = simulateCombat(fighter({ hp: 30, bagWidth: 4, sequence: [herb] }), fighter(), createRng(1));
    expect(usesOf(hurt, 'h').map((e) => (e.kind === 'heal' ? e.hp : -1))).toEqual([35, 40, 45]);
    expect(hurt.spentItems).toEqual(['h']);
  });

  it('reports partially used charges', () => {
    const herb = tool('h', [0], 4, { kind: 'heal', dice: dice(0, 1, 5) }, 3);
    const r = simulateCombat(fighter({ hp: 45, bagWidth: 4, sequence: [herb], weapons: finisher }), fighter(), createRng(1));
    expect(r.toolCharges.h).toBe(2);
  });

  it('a one-shot bomb fires once and is spent', () => {
    const bomb = tool('b', [0], 0, { kind: 'damage', dice: dice(0, 1, 6) }, 1);
    const r = simulateCombat(sturdy({ bagWidth: 4, sequence: [bomb] }), sturdy(), createRng(1));
    expect(usesOf(r, 'b').map((e) => e.t)).toEqual([1]);
    expect(r.spentItems).toEqual(['b']);
  });

  it('stamina tools only fire when stamina is missing', () => {
    const jerky = tool('j', [0], 4, { kind: 'stamina', amount: 3 });
    const rested = simulateCombat(sturdy({ bagWidth: 4, sequence: [jerky] }), sturdy(), createRng(1));
    expect(usesOf(rested, 'j')).toHaveLength(0);
    const tired = sturdy({
      bagWidth: 4,
      stats: { ...BASE_STATS, maxHp: 1000, staminaRegen: 0 },
      weapons: [{ dice: dice(0, 1, 1), cooldown: 1, staminaCost: 4 }],
      sequence: [jerky],
    });
    expect(usesOf(simulateCombat(tired, sturdy(), createRng(1)), 'j')[0]).toMatchObject({ kind: 'buff', t: 1 });
  });
});
```

- [ ] **Step 3: 失敗を確認する**

Run: `npx vitest run tests/core/sequencer-combat.test.ts`
Expected: FAIL（`bagWidth` が無視される、`toolCharges` が undefined など）

- [ ] **Step 4: combat.ts を全体置き換えする**

`src/core/combat.ts`：

```ts
import { type Dice, dice, formatDice, rollDice } from './dice';
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

/** 当たった攻撃のダメージを計算して与える（防御で最低 1、その後に盾布で軽減） */
function strike(foe: FighterState, raw: number): { damage: number; blocked: number } {
  let damage = Math.max(1, raw - foe.f.stats.defense);
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
      if (me.hp >= me.f.stats.maxHp) return false;
      heal(me, side, rollDice(effect.dice, rng), entry.label, t, events, entry.uid);
      return true;
    case 'stamina':
      if (me.stamina >= me.f.stats.maxStamina - EPS) return false;
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
```

- [ ] **Step 5: テストを通す**

Run: `npx vitest run tests/core/sequencer-combat.test.ts tests/core/combat.test.ts && npm run typecheck`
Expected: 両方 PASS。型エラーなし。`src/ui/screens.ts` の `renderBattleProgress` の `switch` が新しいイベントを扱っていないことは、`noFallthroughCasesInSwitch` ではエラーにならない（UI は Task 8 で更新する）。

---

### Task 4: 潜入側で戦闘結果をバッグに反映する

**Files:**
- Modify: `src/core/raid.ts`
- Test: `tests/core/raid.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

`tests/core/raid.test.ts` の import に `placeItem` を追加する（`import { createGrid, placeItem } from '../../src/core/grid';`）。`describe('raid', () => {` の中に追加する：

```ts
  it('spent tools leave the bag after a fight, and the pre-fight bag is kept for playback', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const bomb = createItem('bomb');
    const s = structuredClone(withRoom(state, target, { type: 'monster', monsterId: 'rat', cleared: false }));
    s.adventurer.bagGrid = placeItem(s.adventurer.bagGrid, bomb, 0, 0, 0);
    const next = moveTo(s, target, rng);
    expect(next.lastBattle?.result.spentItems).toEqual([bomb.uid]);
    expect(next.adventurer.bagGrid.placements.some((p) => p.item.uid === bomb.uid)).toBe(false);
    expect(next.lastBattle?.bag.placements.some((p) => p.item.uid === bomb.uid)).toBe(true);
  });
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: FAIL（爆弾がバッグに残る、`lastBattle.bag` が undefined）

- [ ] **Step 3: raid.ts を変更する**

import に追加する：

```ts
import type { Grid } from './grid';
import { applyToolUsage } from './sequencer';
```

`LastBattle` を置き換える：

```ts
export interface LastBattle {
  monsterId: string;
  result: CombatResult;
  /** 戦闘開始時のバッグ（戦闘画面の再生用） */
  bag: Grid;
}
```

`fight()` の先頭 4 行（`const result = ...` から `s.adventurer.hp = result.finalHp[0];` まで）を次に置き換える：

```ts
  const bagBefore = structuredClone(s.adventurer.bagGrid);
  const result = simulateCombat(fighterFromAdventurer(s.adventurer), fighterFromMonster(monster), rng);
  s.lastBattle = { monsterId: monster.id, result, bag: bagBefore };
  s.adventurer.hp = result.finalHp[0];
  s.adventurer.bagGrid = applyToolUsage(s.adventurer.bagGrid, result.toolCharges, result.spentItems);
```

（`if (!room.monsterId) ...` と `const monster = getMonster(room.monsterId);` はそのまま残す。）

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/raid.test.ts && npm run typecheck`
Expected: PASS。型エラーなし。

---

### Task 5: 道具の入手先（宝箱・ドロップ・商人・無料支給）

**Files:**
- Modify: `src/core/loot.ts`, `src/core/monsters.ts`, `src/core/town.ts`
- Test: `tests/core/town.test.ts`

- [ ] **Step 1: テストを追加・修正する**

`tests/core/town.test.ts` の import に `placeItem` が既にあることを確認する。`describe('town', () => {` の中に追加する：

```ts
  it('free kit adds an old knife when the bag has no tools', () => {
    const kit = withFreeKit(createAdventurer());
    expect(kit.bagGrid.placements.map((p) => p.item.defId)).toEqual(['old_knife']);
  });

  it('free kit does not add a knife when the bag already has a tool', () => {
    const base = withFreeKit(createAdventurer());
    const bomb = createItem('bomb');
    const withBomb = { ...base, bagGrid: placeItem(createGrid(4, 3), bomb, 0, 0, 0) };
    expect(withFreeKit(withBomb).bagGrid.placements.map((p) => p.item.defId)).toEqual(['bomb']);
  });
```

import に `createGrid` を追加する（`import { countGold, createGrid, placeItem, storeItem } from '../../src/core/grid';`）。

既存のテスト `finishRaid after escaping keeps gear and converts bag gold` の次の行を：

```ts
    expect(after.loadout.bagGrid.placements.map((p) => p.item.defId)).toEqual(['gem']);
```

次に置き換える（無料支給の古びた投げナイフもバッグに入るため）：

```ts
    expect(after.loadout.bagGrid.placements.map((p) => p.item.defId)).toEqual(['old_knife', 'gem']);
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/town.test.ts`
Expected: FAIL（`old_knife` が入らない）

- [ ] **Step 3: 実装する**

`src/core/town.ts`：`FREE_KIT` に `tool: 'old_knife',` を追加する：

```ts
export const FREE_KIT = {
  rightHand: 'rusty_dagger',
  body: 'rag_shirt',
  bag: 'cloth_sack',
  consumable: 'black_bread',
  tool: 'old_knife',
} as const;
```

`withFreeKit` の `return next;` の直前に追加する：

```ts
  const hasTool = next.bagGrid.placements.some((p) => getDef(p.item.defId).kind === 'tool');
  if (!hasTool) {
    const stored = storeItem(next.bagGrid, createItem(FREE_KIT.tool));
    if (stored) next.bagGrid = stored;
  }
```

`src/core/loot.ts`：`CHEST_TABLE` の配列の末尾（`{ defId: 'leather_pack', weight: 1 },` の後）に追加する：

```ts
  { defId: 'bomb', weight: 5 }, { defId: 'herb', weight: 5 }, { defId: 'throwing_knife', weight: 3 },
  { defId: 'jerky', weight: 3 }, { defId: 'whetstone', weight: 2 }, { defId: 'guard_cloth', weight: 2 },
```

`SHOP_POOL` を置き換える：

```ts
export const SHOP_POOL: readonly string[] = [
  'dagger', 'club', 'short_sword', 'leather_cap', 'leather_armor', 'leather_pants', 'boots', 'gloves',
  'bracers', 'rope_belt', 'leather_belt', 'potion', 'leather_pack',
  'throwing_knife', 'bomb', 'herb', 'jerky',
];
```

`src/core/monsters.ts`：ゴブリンの `drops` の配列末尾に `{ defId: 'throwing_knife', chance: 0.15 }, { defId: 'bomb', chance: 0.1 }` を追加し、骸骨兵の `drops` の配列末尾に `{ defId: 'guard_cloth', chance: 0.1 }` を追加する。

- [ ] **Step 4: テストを通す**

Run: `npm test && npm run typecheck`
Expected: すべて PASS（`tests/core/loot.test.ts` の「参照しているアイテム ID がすべて存在する」も通る）。

---

### Task 6: 古いセーブデータの互換

**Files:**
- Modify: `src/core/save.ts`
- Test: `tests/core/save.test.ts`

- [ ] **Step 1: 失敗するテストを追加する**

`tests/core/save.test.ts` の `describe('save', () => {` の中に追加する：

```ts
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
```

- [ ] **Step 2: 失敗を確認する**

Run: `npx vitest run tests/core/save.test.ts`
Expected: FAIL（`charges` が undefined のまま）

- [ ] **Step 3: 実装する**

`src/core/save.ts` の `loadProfile` で、`getDef` による検証ループを次に置き換える：

```ts
  try {
    for (const item of allItems(file.profile)) {
      const def = getDef(item.defId);
      // 古いセーブには charges が無いので、定義の最大回数で補う
      if ((item as { charges?: number | null }).charges === undefined) item.charges = def.tool?.maxCharges ?? null;
    }
  } catch {
    return null;
  }
```

- [ ] **Step 4: テストを通す**

Run: `npx vitest run tests/core/save.test.ts && npm run typecheck`
Expected: PASS

---

### Task 7: バランスの回帰テストと調整

**Files:**
- Test: `tests/core/balance.test.ts`
- Modify（調整が必要な場合のみ）: `src/core/monsters.ts`

仕様書 §5 の目標をテストにする。乱数のシードは固定なので、結果は毎回同じになる。

- [ ] **Step 1: テストを書く**

`tests/core/balance.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { fighterFromAdventurer, fighterFromMonster, simulateCombat } from '../../src/core/combat';
import { computeStats, createAdventurer } from '../../src/core/equipment';
import { MONSTER_IDS, getMonster } from '../../src/core/monsters';
import { createRng } from '../../src/core/rng';
import { withFreeKit } from '../../src/core/town';

const SEEDS = 300;

function winRate(startHp: number, monsterId: string): number {
  const kit = withFreeKit(createAdventurer());
  let wins = 0;
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = simulateCombat(fighterFromAdventurer({ ...kit, hp: startHp }), fighterFromMonster(getMonster(monsterId)), createRng(seed));
    if (r.winner === 0) wins++;
  }
  return wins / SEEDS;
}

describe('balance (starter kit + old knife)', () => {
  const maxHp = computeStats(withFreeKit(createAdventurer()).equipment).maxHp;

  it('wins against every shallow monster at full HP', () => {
    for (const id of MONSTER_IDS) expect(winRate(maxHp, id), id).toBeGreaterThanOrEqual(0.95);
  });

  it('a ghoul fight at half HP is roughly a coin flip', () => {
    const rate = winRate(Math.floor(maxHp / 2), 'ghoul');
    expect(rate).toBeGreaterThanOrEqual(0.4);
    expect(rate).toBeLessThanOrEqual(0.6);
  });
});
```

- [ ] **Step 2: 実行して、必要なら屍食鬼を調整する**

Run: `npx vitest run tests/core/balance.test.ts`

- PASS なら調整は不要。
- 「HP 半分の屍食鬼戦」の勝率が 0.6 を超えて FAIL した場合は、`src/core/monsters.ts` の屍食鬼の `maxHp` を 2 ずつ上げて、再実行する。0.4 未満なら 2 ずつ下げる。
- 範囲に入ったら、「HP 満タンで全勝（0.95 以上）」のテストも通ることを確認する。両方を満たせない場合は、屍食鬼の `weapon.dice` の修正値（`dice(2, 4, 1)` の 3 番目）を 1 下げてから、`maxHp` の調整をやり直す。
- 最終的な値と勝率を、レポートに記録する。

- [ ] **Step 3: 全体を確認する**

Run: `npm test && npm run typecheck`
Expected: すべて PASS

---

### Task 8: 戦闘画面にバッグとカーソルを表示する

**Files:**
- Modify: `src/ui/views.ts`, `src/ui/screens.ts`, `src/ui/style.css`

- [ ] **Step 1: views.ts — 道具の説明とグリッド描画の共通化**

import を追加する：

```ts
import { toolEffectText } from '../core/sequencer';
```

`describeItem` の `if (d.consumableSlots) ...` の行の直前に追加する：

```ts
  if (d.tool) lines.push(`戦闘道具 CT ${d.tool.cooldown}秒：${toolEffectText(d.tool.effect)}`);
  if (d.tool?.maxCharges) lines.push(`残り ${item.charges ?? d.tool.maxCharges}/${d.tool.maxCharges}`);
  if (d.consumable) lines.push('バッグに置くと、カーソルが来たときHPが減っていれば使う');
```

`renderGrid` を、次の `gridCells` と `renderGrid` と `renderBattleBag` に置き換える：

```ts
/** グリッドの各マスに、そこを占める配置と、アイコンを描くマス（配置の先頭マス）を対応づける */
function gridCells(grid: Grid): { owner: Map<string, Placement>; anchor: Set<string> } {
  const owner = new Map<string, Placement>();
  const anchor = new Set<string>();
  for (const p of grid.placements) {
    placementCells(p).forEach(([x, y], i) => {
      owner.set(`${x},${y}`, p);
      if (i === 0) anchor.add(`${x},${y}`);
    });
  }
  return { owner, anchor };
}

function cellContent(p: Placement): string {
  return `${getDef(p.item.defId).icon}${p.item.qty > 1 ? `<small>${p.item.qty}</small>` : ''}`;
}

export function renderGrid(grid: Grid, container: 'stash' | 'bag', selectedUid: string | null): string {
  if (grid.w === 0 || grid.h === 0) return '<p class="muted">バッグを装備していません</p>';
  const { owner, anchor } = gridCells(grid);
  let html = `<div class="grid" style="--cols:${grid.w}">`;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const key = `${x},${y}`;
      const p = owner.get(key);
      const classes = ['cell'];
      let style = '';
      let content = '';
      let tip = '';
      if (p) {
        classes.push('filled');
        if (p.item.uid === selectedUid) classes.push('selected');
        style = ` style="--hue:${hueOf(p.item.defId)}"`;
        tip = ` data-tip="${esc(describeItem(p.item))}"`;
        if (anchor.has(key)) content = cellContent(p);
      }
      html += `<div class="${classes.join(' ')}"${style} data-action="cell" data-container="${container}" data-x="${x}" data-y="${y}"${tip}>${content}</div>`;
    }
  }
  return `${html}</div>`;
}

/** 戦闘画面用のバッグ表示（操作不可）。カーソルの列と、発動中の道具を強調する */
export function renderBattleBag(grid: Grid, cursorCol: number, flashing: ReadonlySet<string>): string {
  if (grid.w === 0 || grid.h === 0) return '<p class="muted">バッグなし</p>';
  const { owner, anchor } = gridCells(grid);
  let html = `<div class="grid battle-bag" style="--cols:${grid.w}">`;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const key = `${x},${y}`;
      const p = owner.get(key);
      const classes = ['cell'];
      if (x === cursorCol) classes.push('cursor');
      let style = '';
      let content = '';
      let tip = '';
      if (p) {
        classes.push('filled');
        if (flashing.has(p.item.uid)) classes.push('flash');
        style = ` style="--hue:${hueOf(p.item.defId)}"`;
        tip = ` data-tip="${esc(describeItem(p.item))}"`;
        if (anchor.has(key)) content = cellContent(p);
      }
      html += `<div class="${classes.join(' ')}"${style}${tip}>${content}</div>`;
    }
  }
  return `${html}</div>`;
}
```

- [ ] **Step 2: screens.ts — 戦闘ログとバッグのミニ表示**

`import { describeItem, esc, itemLabel, renderEquipment, renderGrid } from './views';` を次に置き換える：

```ts
import { describeItem, esc, itemLabel, renderBattleBag, renderEquipment, renderGrid } from './views';
```

`renderBattleProgress` を次に置き換える：

```ts
export function renderBattleProgress(raid: RaidState, shown: number): string {
  const battle = raid.lastBattle;
  if (!battle) return '';
  const monster = getMonster(battle.monsterId);
  const r = battle.result;
  const hp: [number, number] = [r.startHp[0], r.startHp[1]];
  const names: [string, string] = ['あなた', monster.name];
  const visible = r.events.slice(0, shown);
  const latestT = visible.length > 0 ? visible[visible.length - 1].t : 0;
  const flashing = new Set<string>();
  let cursorCol = -1;
  const lines: string[] = [];
  const blockedText = (blocked: number): string => (blocked > 0 ? `（${blocked}軽減）` : '');
  for (const e of visible) {
    const who = names[e.actor];
    const ts = `${e.t.toFixed(1)}s`;
    if (e.actor === 0 && 'uid' in e && e.uid && e.t >= latestT - 0.05) flashing.add(e.uid);
    switch (e.kind) {
      case 'hit':
        hp[e.actor === 0 ? 1 : 0] = e.targetHp;
        lines.push(`${ts} ${who}の攻撃！ 🎲${e.dice}=${e.roll}${e.bonus > 0 ? ` +🪨${e.bonus}` : ''} → ${e.damage}ダメージ${blockedText(e.blocked)}`);
        break;
      case 'miss':
        lines.push(`${ts} ${who}の攻撃は外れた`);
        break;
      case 'heal':
        hp[e.actor] = e.hp;
        lines.push(`${ts} ${who}は${e.source}でHPが${e.amount}回復`);
        break;
      case 'fatigue':
        hp[e.actor] = e.hp;
        lines.push(`${ts} ${who}は疲労で${e.damage}ダメージ`);
        break;
      case 'cursor':
        if (e.actor === 0) cursorCol = e.col;
        break;
      case 'toolHit':
        hp[e.actor === 0 ? 1 : 0] = e.targetHp;
        lines.push(`${ts} ${e.name} 🎲${e.dice}=${e.roll} → ${e.damage}ダメージ${blockedText(e.blocked)}`);
        break;
      case 'toolMiss':
        lines.push(`${ts} ${e.name}は外れた`);
        break;
      case 'buff':
        lines.push(`${ts} ${e.name}：${e.text}`);
        break;
    }
  }
  return `<div class="battle">${fighterCard('🧙', names[0], hp[0], r.maxHp[0])}<div class="vs">VS</div>${fighterCard(monster.icon, names[1], hp[1], r.maxHp[1])}</div>
  <div class="battle-bag-wrap"><h3>バッグ（カーソル ${cursorCol >= 0 ? `列${cursorCol + 1}` : '待機中'}）</h3>${renderBattleBag(battle.bag, cursorCol, flashing)}</div>
  <ul class="log battle-log">${lines.slice(-12).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}
```

- [ ] **Step 3: style.css に追加する**

`src/ui/style.css` の末尾に追加する：

```css
.battle-bag-wrap { display: flex; flex-direction: column; align-items: center; margin-bottom: 12px; }
.battle-bag .cell { cursor: default; }
.battle-bag .cell.cursor { box-shadow: inset 0 0 0 2px #6fa0d8; }
.battle-bag .cell.cursor:not(.filled) { background: #2c3546; }
.battle-bag .cell.flash { outline: 2px solid var(--accent); outline-offset: -2px; filter: brightness(1.6); }
```

- [ ] **Step 4: 型チェック、テスト、ビルド**

Run: `npm run typecheck && npm test && npm run build`
Expected: すべて成功する

---

### Task 9: 手動確認

**Files:** なし（不具合があれば該当ファイルを修正する。core の不具合なら、先に再現テストを追加する）

- [ ] **Step 1: 開発サーバーで確認する**

Run: `npm run dev`（`http://localhost:5173/`）

1. 潜入すると、バッグの左上に「🔪 古びた投げナイフ」が入っている。ツールチップに「戦闘道具 CT 2秒：敵に1d3ダメージ」と出る。
2. モンスターと戦うと、戦闘画面にバッグが表示される。カーソルの列が 1 秒ごとに右へ動き、右端の次は左端に戻る。
3. 投げナイフの列にカーソルが来ると、そのマスが光り、ログに `🔪古びた投げナイフ 🎲1d3=… → …ダメージ` が出る。
4. 爆弾を拾ってバッグに入れて戦うと、1 回だけ発動し、戦闘後にバッグから消えている。
5. 薬草を使うと、ツールチップの「残り」が戦闘後に減っている。
6. 宝物を詰め込んだ列では、カーソルが来ても何も起きない。
7. 拠点の商人に、投げナイフ・爆弾・薬草・干し肉が並ぶことがある（品揃えはランダムなので、何回か潜入して確認する）。
8. リロードしても、道具の残り回数が保たれている。

---

## 仕様書との対応

| 仕様書 | タスク |
|---|---|
| §2.1 カーソル（1 列 1 秒、折り返し、t=1 で列 0） | 3 |
| §2.2 発動（CT、開始時は全部明け、処理順、回数） | 2（並び順）、3 |
| §2.3 形と向き | 2（cols）、3（テスト） |
| §2.4 発動しないもの | 2 |
| §2.5 既存との関係（武器、ベルト、バッグの消費アイテム） | 2、3 |
| §2.6 効果 5 種 | 3 |
| §2.7 道具 6 種＋アイコン変更＋残り回数の表示 | 1、8 |
| §3 敵はシーケンサーなし（ロジックは両者対応） | 3 |
| §4 入手先 | 5 |
| §5 バランス | 7 |
| §6 戦闘画面 | 8 |
| §7 セーブ互換 | 6 |
