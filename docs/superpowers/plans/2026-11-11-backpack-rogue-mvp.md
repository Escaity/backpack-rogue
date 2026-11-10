# Backpack Rogue MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザで遊べる MVP を作る。拠点で装備を整え、浅層1階に潜入してモンスターとオートバトルを行い、戦利品を持って脱出口から生還する。このループが一周回ること。

**Architecture:** ゲームのルールはすべて `src/core/` の純粋な TypeScript モジュールに置く。状態を不変データとして受け取り、新しい状態を返す関数で構成し、Vitest で単体テストする。乱数はシード付きの `Rng` を引数で渡す。`src/ui/` は core の状態を HTML 文字列に描画し、クリックを core の関数呼び出しに変換するだけにして、ルールは持たせない。

**Tech Stack:** TypeScript 5.9 / Vite / Vitest / 素の DOM（フレームワークなし）/ localStorage

**Spec:** `docs/superpowers/specs/2026-11-11-backpack-rogue-design.md`

---

## MVP での決定事項（仕様書の補足）

- **拠点の金貨は財布（数値）で持つ。** ダンジョン内では金貨はバッグのマスを使う。脱出時に、バッグ内の金貨は自動で財布に移る。倉庫に金貨は置かない。
- **潜入を開始した時点でセーブする。** このとき拠点の手持ち（loadout）は空になる。潜入中にリロードすると、持ち込んだ物は失われる（回線切断は死亡と同じ扱い）。
- **装備の入れ替え**：埋まっている枠には置けない。先に外す必要がある（入れ替え操作はなし）。
- **ベルトを外す**のは、2番目以降の消費アイテム枠が空のときだけ。ベルトが壊れた場合、はみ出した枠は「使用不可」になり、戦闘では使われない。
- **バッグを外す**のは、中身が空のときだけ。
- **脱出口**：開いた後（12ターン目以降）は、マップ上で位置がわかる。
- **床のアイテム**：部屋ごとに床があり、置いたアイテムは残る。あとで拾いに戻れる。
- **盾、両手武器、レアリティ、強化・修理・合成、ライバル、深層**は MVP に含めない。右手と左手は、どちらも武器を受け付ける。
- **操作**：アイテムをクリックして選択し、置き先をクリックする。R キーで回転、Esc で選択解除。

## ファイル構成

```
backpack_rogue/
├── index.html
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts               # 起動（セーブ読み込み → App 生成）
│   ├── core/
│   │   ├── errors.ts         # GameError（UI に表示するエラーの基底クラス）
│   │   ├── rng.ts            # シード付き乱数
│   │   ├── items.ts          # アイテム定義、形状、回転、インスタンス生成
│   │   ├── grid.ts           # バッグと倉庫のグリッド配置
│   │   ├── equipment.ts      # 装備枠、冒険者、ステータス計算、耐久度
│   │   ├── inventory.ts      # 倉庫、バッグ、装備、床の間のアイテム移動
│   │   ├── monsters.ts       # モンスター定義
│   │   ├── loot.ts           # ドロップ、宝箱、商人の品揃え
│   │   ├── combat.ts         # クールタイム制オートバトル
│   │   ├── dungeon.ts        # 部屋マップ生成、瘴気、脱出口
│   │   ├── raid.ts           # 潜入中の行動（移動、戦闘、宝箱、泉、脱出）
│   │   ├── town.ts           # 拠点（プロフィール、商人、倉庫拡張、潜入開始と終了）
│   │   └── save.ts           # localStorage への保存と読み込み
│   └── ui/
│       ├── style.css
│       ├── views.ts          # 部品の描画（グリッド、人型装備、アイテム説明）
│       ├── screens.ts        # 画面の描画（拠点、潜入、戦闘、結果）
│       └── app.ts            # 画面遷移、選択状態、クリック処理
└── tests/core/*.test.ts
```

## Git について

このフォルダは現在 git 管理されていない。各タスクの「Commit」ステップは、**ユーザーが git の利用を承認した場合にだけ**実行する。承認されていない場合は、コミットせずに次へ進む。

---

### Task 0: プロジェクトの雛形

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `.gitignore`, `src/main.ts`（仮）

- [ ] **Step 1: package.json を作る**

```json
{
  "name": "backpack-rogue",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: 依存パッケージを入れる**

Run: `npm install -D typescript@5.9 vite vitest`
Expected: `node_modules/` が作られ、`package.json` に devDependencies が追加される。

- [ ] **Step 3: tsconfig.json を作る**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 4: index.html と仮の main.ts を作る**

`index.html`:
```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Backpack Rogue</title>
    <link rel="stylesheet" href="/src/ui/style.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`（Task 14 で置き換える）:
```ts
const root = document.getElementById('app');
if (root) root.textContent = 'Backpack Rogue';
```

`src/ui/style.css`（Task 12 で置き換える）:
```css
body { background: #14161a; color: #e6e6e6; }
```

`.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 5: 動作確認**

Run: `npm run typecheck && npm run build`
Expected: エラーなしで `dist/` が作られる。

- [ ] **Step 6: Commit（承認がある場合のみ）**

```bash
git init
git add .
git commit -m "chore: scaffold vite + typescript + vitest project"
```

---

### Task 1: 乱数とエラー基底クラス

**Files:**
- Create: `src/core/rng.ts`, `src/core/errors.ts`
- Test: `tests/core/rng.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/rng.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';

describe('rng', () => {
  it('returns the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('returns different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('int stays within the inclusive range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('pick throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow();
  });

  it('chance(0) is always false and chance(1) is always true', () => {
    const rng = createRng(3);
    for (let i = 0; i < 50; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });

  it('shuffle keeps all elements', () => {
    const out = createRng(5).shuffle([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: FAIL（`Cannot find module '../../src/core/rng'`）

- [ ] **Step 3: 実装する**

`src/core/rng.ts`:
```ts
export interface Rng {
  /** [0, 1) の一様乱数 */
  next(): number;
  /** min 以上 max 以下の整数 */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(probability: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick from empty array');
      return items[Math.floor(next() * items.length)];
    },
    chance: (probability) => next() < probability,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
```

`src/core/errors.ts`:
```ts
/** プレイヤーに表示してよいルール違反（「そこには置けません」など） */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/rng.ts src/core/errors.ts tests/core/rng.test.ts
git commit -m "feat(core): add seeded rng and GameError"
```

---

### Task 2: アイテム定義

**Files:**
- Create: `src/core/items.ts`
- Test: `tests/core/items.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/items.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, createItem, getDef, rotateShape } from '../../src/core/items';

describe('items', () => {
  it('getDef throws for unknown ids', () => {
    expect(() => getDef('nope')).toThrow();
  });

  it('createItem sets durability from the definition', () => {
    expect(createItem('short_sword').durability).toBe(25);
    expect(createItem('gem').durability).toBeNull();
  });

  it('createItem gives unique uids', () => {
    expect(createItem('gem').uid).not.toBe(createItem('gem').uid);
  });

  it('rotates a vertical bar to horizontal', () => {
    expect(rotateShape([[0, 0], [0, 1], [0, 2]], 1)).toEqual([[0, 0], [1, 0], [2, 0]]);
  });

  it('rotates an L shape clockwise', () => {
    expect(rotateShape([[0, 0], [1, 0], [0, 1], [0, 2]], 1)).toEqual([[0, 0], [1, 0], [2, 0], [2, 1]]);
  });

  it('rotation 0 keeps the shape (sorted)', () => {
    expect(rotateShape([[1, 0], [0, 0]], 0)).toEqual([[0, 0], [1, 0]]);
  });

  it('every definition is consistent', () => {
    for (const def of Object.values(ITEM_DEFS)) {
      expect(def.shape.length, def.id).toBeGreaterThan(0);
      if (def.kind === 'equipment') expect(def.slot, def.id).toBeDefined();
      if (def.kind === 'bag') expect(def.bagSize, def.id).toBeDefined();
      if (def.kind === 'consumable') expect(def.consumable, def.id).toBeDefined();
      if (def.slot === 'weapon') expect(def.weapon, def.id).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/items.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/items.ts`:
```ts
export type Cell = readonly [number, number];
export type Rotation = 0 | 1 | 2 | 3;
export type ItemSlot = 'weapon' | 'head' | 'body' | 'belt' | 'legs' | 'feet' | 'hands' | 'arms' | 'ring' | 'neck';
export type ItemKind = 'equipment' | 'consumable' | 'treasure' | 'gold' | 'bag';

export interface StatMods {
  maxHp?: number;
  defense?: number;
  /** 0〜1 の回避率を加算 */
  evasion?: number;
  /** 攻撃速度倍率に加算（0.1 = +10%） */
  attackSpeed?: number;
  maxStamina?: number;
}

export interface WeaponStats {
  damage: number;
  /** 秒 */
  cooldown: number;
  staminaCost: number;
}

export interface PeriodicHeal {
  every: number;
  heal: number;
}

export interface ConsumableEffect {
  /** HP 割合がこの値未満になったら発動 */
  hpBelow: number;
  heal: number;
}

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  shape: readonly Cell[];
  /** 売値（1個あたり） */
  value: number;
  slot?: ItemSlot;
  mods?: StatMods;
  weapon?: WeaponStats;
  periodicHeal?: PeriodicHeal;
  consumable?: ConsumableEffect;
  /** ベルトが提供する消費アイテム枠の数 */
  consumableSlots?: number;
  bagSize?: { w: number; h: number };
  maxDurability?: number;
  stackMax?: number;
}

export interface ItemInstance {
  uid: string;
  defId: string;
  qty: number;
  durability: number | null;
}

export const GOLD_ID = 'gold';

export function rect(w: number, h: number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push([x, y]);
  return cells;
}

const L_SHAPE: Cell[] = [[0, 0], [1, 0], [0, 1], [0, 2]];

const DEFS: ItemDef[] = [
  // 武器
  { id: 'rusty_dagger', name: '錆びた短剣', icon: '🔪', kind: 'equipment', slot: 'weapon', shape: rect(1, 2), value: 0, weapon: { damage: 3, cooldown: 1.2, staminaCost: 1 }, maxDurability: 10 },
  { id: 'dagger', name: '短剣', icon: '🗡️', kind: 'equipment', slot: 'weapon', shape: rect(1, 2), value: 15, weapon: { damage: 4, cooldown: 1.0, staminaCost: 1 }, maxDurability: 20 },
  { id: 'club', name: '棍棒', icon: '🏏', kind: 'equipment', slot: 'weapon', shape: rect(1, 3), value: 10, weapon: { damage: 5, cooldown: 1.6, staminaCost: 2 }, maxDurability: 15 },
  { id: 'short_sword', name: 'ショートソード', icon: '⚔️', kind: 'equipment', slot: 'weapon', shape: rect(1, 3), value: 30, weapon: { damage: 6, cooldown: 1.4, staminaCost: 2 }, maxDurability: 25 },
  { id: 'war_axe', name: '戦斧', icon: '🪓', kind: 'equipment', slot: 'weapon', shape: L_SHAPE, value: 45, weapon: { damage: 10, cooldown: 2.2, staminaCost: 3 }, maxDurability: 25 },
  // 防具
  { id: 'rag_shirt', name: 'ボロ布の服', icon: '👕', kind: 'equipment', slot: 'body', shape: rect(2, 2), value: 0, mods: { defense: 1 }, maxDurability: 10 },
  { id: 'leather_armor', name: '革鎧', icon: '🦺', kind: 'equipment', slot: 'body', shape: rect(2, 2), value: 35, mods: { defense: 3 }, maxDurability: 25 },
  { id: 'chain_mail', name: '鎖帷子', icon: '🥋', kind: 'equipment', slot: 'body', shape: rect(2, 3), value: 60, mods: { defense: 5, maxHp: 10 }, maxDurability: 30 },
  { id: 'leather_cap', name: '革の帽子', icon: '🧢', kind: 'equipment', slot: 'head', shape: rect(2, 1), value: 12, mods: { defense: 1, maxHp: 5 }, maxDurability: 20 },
  { id: 'leather_pants', name: '革のズボン', icon: '👖', kind: 'equipment', slot: 'legs', shape: rect(2, 2), value: 20, mods: { defense: 2 }, maxDurability: 20 },
  { id: 'boots', name: '旅人の靴', icon: '🥾', kind: 'equipment', slot: 'feet', shape: rect(2, 1), value: 18, mods: { evasion: 0.05 }, maxDurability: 20 },
  { id: 'gloves', name: '革手袋', icon: '🧤', kind: 'equipment', slot: 'hands', shape: rect(2, 1), value: 15, mods: { attackSpeed: 0.1 }, maxDurability: 20 },
  { id: 'bracers', name: '革の腕当て', icon: '🦾', kind: 'equipment', slot: 'arms', shape: rect(2, 1), value: 15, mods: { defense: 1, attackSpeed: 0.05 }, maxDurability: 20 },
  { id: 'rope_belt', name: '布の帯', icon: '🎗️', kind: 'equipment', slot: 'belt', shape: rect(2, 1), value: 5, consumableSlots: 2, maxDurability: 20 },
  { id: 'leather_belt', name: '革のベルト', icon: '🪢', kind: 'equipment', slot: 'belt', shape: rect(2, 1), value: 25, consumableSlots: 3, maxDurability: 25 },
  // 装飾品（耐久度なし）
  { id: 'ring_vigor', name: '活力の指輪', icon: '💍', kind: 'equipment', slot: 'ring', shape: rect(1, 1), value: 40, periodicHeal: { every: 5, heal: 2 } },
  { id: 'ring_guard', name: '守りの指輪', icon: '💍', kind: 'equipment', slot: 'ring', shape: rect(1, 1), value: 40, mods: { defense: 1 } },
  { id: 'amulet_life', name: '生命のアミュレット', icon: '📿', kind: 'equipment', slot: 'neck', shape: rect(1, 1), value: 50, mods: { maxHp: 15 } },
  // 消費アイテム
  { id: 'black_bread', name: '黒パン', icon: '🍞', kind: 'consumable', shape: rect(1, 1), value: 0, consumable: { hpBelow: 0.5, heal: 8 } },
  { id: 'potion', name: '回復ポーション', icon: '🧪', kind: 'consumable', shape: rect(1, 1), value: 20, consumable: { hpBelow: 0.5, heal: 20 } },
  // 宝物
  { id: 'silver_cup', name: '銀の杯', icon: '🏆', kind: 'treasure', shape: rect(1, 1), value: 30 },
  { id: 'gem', name: 'ルビー', icon: '💎', kind: 'treasure', shape: rect(1, 1), value: 60 },
  { id: 'gold_idol', name: '金の像', icon: '🗿', kind: 'treasure', shape: rect(2, 2), value: 120 },
  { id: 'old_painting', name: '古い絵画', icon: '🖼️', kind: 'treasure', shape: rect(3, 2), value: 90 },
  // 金貨
  { id: GOLD_ID, name: '金貨', icon: '🪙', kind: 'gold', shape: rect(1, 1), value: 1, stackMax: 50 },
  // バッグ
  { id: 'cloth_sack', name: '布袋', icon: '👝', kind: 'bag', shape: rect(2, 2), value: 0, bagSize: { w: 4, h: 3 } },
  { id: 'leather_pack', name: '革の背嚢', icon: '🎒', kind: 'bag', shape: rect(2, 3), value: 40, bagSize: { w: 5, h: 4 } },
  { id: 'big_pack', name: '冒険者の大鞄', icon: '🧳', kind: 'bag', shape: rect(3, 3), value: 100, bagSize: { w: 6, h: 5 } },
];

export const ITEM_DEFS: Readonly<Record<string, ItemDef>> = Object.fromEntries(DEFS.map((d) => [d.id, d]));

export function getDef(defId: string): ItemDef {
  const def = ITEM_DEFS[defId];
  if (!def) throw new Error(`unknown item: ${defId}`);
  return def;
}

export function createItem(defId: string, qty = 1): ItemInstance {
  const def = getDef(defId);
  return { uid: crypto.randomUUID(), defId, qty, durability: def.maxDurability ?? null };
}

/** 時計回りに rot×90° 回転し、左上が (0,0) になるよう平行移動した形状を返す（y→x の順にソート済み） */
export function rotateShape(shape: readonly Cell[], rot: Rotation): Cell[] {
  let cells: [number, number][] = shape.map(([x, y]) => [x, y]);
  for (let i = 0; i < rot; i++) cells = cells.map(([x, y]) => [-y, x]);
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells
    .map(([x, y]): Cell => [x - minX + 0, y - minY + 0])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/items.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/items.ts tests/core/items.test.ts
git commit -m "feat(core): add item definitions and shape rotation"
```

---

### Task 3: グリッド（バッグと倉庫）

**Files:**
- Create: `src/core/grid.ts`
- Test: `tests/core/grid.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createItem } from '../../src/core/items';
import {
  canPlace, countGold, createGrid, findItemAt, placeItem, removeAllGold, removeItem, storeItem,
} from '../../src/core/grid';

describe('grid', () => {
  it('places an item and finds it by any of its cells', () => {
    const sword = createItem('short_sword');
    const g = placeItem(createGrid(4, 3), sword, 0, 0, 0);
    expect(findItemAt(g, 0, 2)?.item.uid).toBe(sword.uid);
    expect(findItemAt(g, 1, 0)).toBeUndefined();
  });

  it('rejects out of bounds', () => {
    expect(canPlace(createGrid(4, 3), createItem('short_sword'), 0, 1, 0)).toBe(false);
  });

  it('allows a rotated placement', () => {
    const g = createGrid(4, 1);
    expect(canPlace(g, createItem('short_sword'), 0, 0, 0)).toBe(false);
    expect(canPlace(g, createItem('short_sword'), 0, 0, 1)).toBe(true);
  });

  it('rejects overlap but can ignore the moving item itself', () => {
    const sword = createItem('short_sword');
    const g = placeItem(createGrid(4, 3), sword, 0, 0, 0);
    expect(canPlace(g, createItem('gem'), 0, 1, 0)).toBe(false);
    expect(canPlace(g, sword, 0, 0, 0, sword.uid)).toBe(true);
  });

  it('placeItem throws when the spot is invalid', () => {
    expect(() => placeItem(createGrid(1, 1), createItem('short_sword'), 0, 0, 0)).toThrow();
  });

  it('removeItem returns the removed item and a new grid', () => {
    const gem = createItem('gem');
    const g = placeItem(createGrid(2, 2), gem, 1, 1, 0);
    const r = removeItem(g, gem.uid);
    expect(r.item.uid).toBe(gem.uid);
    expect(r.grid.placements).toHaveLength(0);
    expect(g.placements).toHaveLength(1);
  });

  it('removeItem throws for unknown uid', () => {
    expect(() => removeItem(createGrid(1, 1), 'missing')).toThrow();
  });

  it('storeItem finds a free spot and returns null when full', () => {
    let g = createGrid(1, 1);
    g = storeItem(g, createItem('gem'))!;
    expect(g.placements).toHaveLength(1);
    expect(storeItem(g, createItem('gem'))).toBeNull();
  });

  it('storeItem rotates items when needed', () => {
    const g = storeItem(createGrid(3, 1), createItem('short_sword'));
    expect(g?.placements[0].rot).toBe(1);
  });

  it('stacks gold up to 50 per cell', () => {
    let g = createGrid(3, 1);
    g = storeItem(g, createItem('gold', 30))!;
    g = storeItem(g, createItem('gold', 30))!;
    expect(g.placements.map((p) => p.item.qty).sort((a, b) => a - b)).toEqual([10, 50]);
    expect(countGold(g)).toBe(60);
  });

  it('removeAllGold strips gold and reports the amount', () => {
    let g = createGrid(3, 1);
    g = storeItem(g, createItem('gold', 20))!;
    g = storeItem(g, createItem('gem'))!;
    const r = removeAllGold(g);
    expect(r.amount).toBe(20);
    expect(r.grid.placements.map((p) => p.item.defId)).toEqual(['gem']);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/grid.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/grid.ts`:
```ts
import { type Cell, GOLD_ID, type ItemInstance, type Rotation, getDef, rotateShape } from './items';

export interface Placement {
  item: ItemInstance;
  x: number;
  y: number;
  rot: Rotation;
}

export interface Grid {
  w: number;
  h: number;
  placements: Placement[];
}

export function createGrid(w: number, h: number): Grid {
  return { w, h, placements: [] };
}

/** 配置が占めるマス（絶対座標）。先頭は左上寄りのマス */
export function placementCells(p: { item: ItemInstance; x: number; y: number; rot: Rotation }): Cell[] {
  return rotateShape(getDef(p.item.defId).shape, p.rot).map(([cx, cy]): Cell => [p.x + cx, p.y + cy]);
}

export function canPlace(grid: Grid, item: ItemInstance, x: number, y: number, rot: Rotation, ignoreUid?: string): boolean {
  const cells = placementCells({ item, x, y, rot });
  if (cells.some(([cx, cy]) => cx < 0 || cy < 0 || cx >= grid.w || cy >= grid.h)) return false;
  const occupied = new Set<string>();
  for (const p of grid.placements) {
    if (p.item.uid === ignoreUid) continue;
    for (const [cx, cy] of placementCells(p)) occupied.add(`${cx},${cy}`);
  }
  return cells.every(([cx, cy]) => !occupied.has(`${cx},${cy}`));
}

export function placeItem(grid: Grid, item: ItemInstance, x: number, y: number, rot: Rotation): Grid {
  if (!canPlace(grid, item, x, y, rot)) throw new Error('cannot place item here');
  return { ...grid, placements: [...grid.placements, { item, x, y, rot }] };
}

export function removeItem(grid: Grid, uid: string): { grid: Grid; item: ItemInstance } {
  const found = grid.placements.find((p) => p.item.uid === uid);
  if (!found) throw new Error(`item not in grid: ${uid}`);
  return { grid: { ...grid, placements: grid.placements.filter((p) => p.item.uid !== uid) }, item: found.item };
}

export function findItemAt(grid: Grid, x: number, y: number): Placement | undefined {
  return grid.placements.find((p) => placementCells(p).some(([cx, cy]) => cx === x && cy === y));
}

export function findFreeSpot(grid: Grid, item: ItemInstance): { x: number; y: number; rot: Rotation } | null {
  for (const rot of [0, 1, 2, 3] as const) {
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        if (canPlace(grid, item, x, y, rot)) return { x, y, rot };
      }
    }
  }
  return null;
}

/** 空いている場所に自動で入れる。スタック可能なら既存のスタックに先に足す。入りきらなければ null */
export function storeItem(grid: Grid, item: ItemInstance): Grid | null {
  const stackMax = getDef(item.defId).stackMax;
  let remaining = item.qty;
  let next: Grid = grid;
  if (stackMax) {
    next = {
      ...grid,
      placements: grid.placements.map((p) => {
        if (remaining <= 0 || p.item.defId !== item.defId || p.item.qty >= stackMax) return p;
        const add = Math.min(stackMax - p.item.qty, remaining);
        remaining -= add;
        return { ...p, item: { ...p.item, qty: p.item.qty + add } };
      }),
    };
  }
  let first = true;
  while (remaining > 0) {
    const qty = stackMax ? Math.min(stackMax, remaining) : remaining;
    const piece: ItemInstance = first ? { ...item, qty } : { ...item, uid: crypto.randomUUID(), qty };
    first = false;
    const spot = findFreeSpot(next, piece);
    if (!spot) return null;
    next = placeItem(next, piece, spot.x, spot.y, spot.rot);
    remaining -= qty;
  }
  return next;
}

export function countGold(grid: Grid): number {
  return grid.placements.reduce((sum, p) => (p.item.defId === GOLD_ID ? sum + p.item.qty : sum), 0);
}

export function removeAllGold(grid: Grid): { grid: Grid; amount: number } {
  return {
    grid: { ...grid, placements: grid.placements.filter((p) => p.item.defId !== GOLD_ID) },
    amount: countGold(grid),
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/grid.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/grid.ts tests/core/grid.test.ts
git commit -m "feat(core): add inventory grid placement"
```

---

### Task 4: 装備とステータス

**Files:**
- Create: `src/core/equipment.ts`
- Test: `tests/core/equipment.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/equipment.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createItem } from '../../src/core/items';
import {
  BASE_STATS, applyWear, canEquip, computeStats, consumableSlotCount, createAdventurer, weaponsOf,
} from '../../src/core/equipment';

describe('equipment', () => {
  it('checks which slot accepts which item', () => {
    expect(canEquip('rightHand', createItem('short_sword'))).toBe(true);
    expect(canEquip('leftHand', createItem('dagger'))).toBe(true);
    expect(canEquip('head', createItem('short_sword'))).toBe(false);
    expect(canEquip('ring1', createItem('ring_guard'))).toBe(true);
    expect(canEquip('ring2', createItem('ring_guard'))).toBe(true);
    expect(canEquip('neck', createItem('gem'))).toBe(false);
  });

  it('belt decides the number of consumable slots', () => {
    expect(consumableSlotCount({})).toBe(1);
    expect(consumableSlotCount({ belt: createItem('rope_belt') })).toBe(2);
    expect(consumableSlotCount({ belt: createItem('leather_belt') })).toBe(3);
  });

  it('sums stat modifiers', () => {
    const s = computeStats({ body: createItem('leather_armor'), head: createItem('leather_cap') });
    expect(s.maxHp).toBe(BASE_STATS.maxHp + 5);
    expect(s.defense).toBe(4);
  });

  it('lists weapons from both hands', () => {
    expect(weaponsOf({ rightHand: createItem('dagger'), leftHand: createItem('short_sword') })).toHaveLength(2);
    expect(weaponsOf({ body: createItem('leather_armor') })).toHaveLength(0);
  });

  it('applyWear reduces durability and breaks items at 0', () => {
    const adv = createAdventurer();
    const worn = { ...createItem('rusty_dagger'), durability: 1 };
    const armor = createItem('leather_armor');
    const ring = createItem('ring_guard');
    const r = applyWear({ ...adv, equipment: { rightHand: worn, body: armor, ring1: ring } });
    expect(r.adventurer.equipment.rightHand).toBeUndefined();
    expect(r.broken.map((b) => b.uid)).toEqual([worn.uid]);
    expect(r.adventurer.equipment.body?.durability).toBe(24);
    expect(r.adventurer.equipment.ring1?.durability).toBeNull();
  });

  it('createAdventurer starts empty with 3 consumable cells', () => {
    const adv = createAdventurer();
    expect(adv.consumables).toEqual([null, null, null]);
    expect(adv.bag).toBeNull();
    expect(adv.bagGrid.w).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/equipment.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/equipment.ts`:
```ts
import { type Grid, createGrid } from './grid';
import { type ItemInstance, type ItemSlot, type WeaponStats, getDef } from './items';

export type EquipSlotId =
  | 'rightHand' | 'leftHand' | 'head' | 'body' | 'belt' | 'legs' | 'feet' | 'hands' | 'arms' | 'ring1' | 'ring2' | 'neck';

export const EQUIP_SLOTS: readonly EquipSlotId[] = [
  'head', 'ring1', 'neck', 'ring2', 'rightHand', 'arms', 'body', 'hands', 'leftHand', 'belt', 'legs', 'feet',
];

export const SLOT_LABELS: Readonly<Record<EquipSlotId, string>> = {
  rightHand: '右手', leftHand: '左手', head: '頭部', body: '胴体', belt: 'ベルト', legs: '脚部',
  feet: '靴', hands: '手袋', arms: '腕', ring1: '指輪R', ring2: '指輪L', neck: 'ネックレス',
};

const SLOT_ACCEPTS: Readonly<Record<EquipSlotId, ItemSlot>> = {
  rightHand: 'weapon', leftHand: 'weapon', head: 'head', body: 'body', belt: 'belt', legs: 'legs',
  feet: 'feet', hands: 'hands', arms: 'arms', ring1: 'ring', ring2: 'ring', neck: 'neck',
};

export const MAX_CONSUMABLE_SLOTS = 3;

export type Equipment = Partial<Record<EquipSlotId, ItemInstance>>;

export interface Adventurer {
  equipment: Equipment;
  /** 常に長さ 3。使えるのは先頭から consumableSlotCount 個 */
  consumables: (ItemInstance | null)[];
  bag: ItemInstance | null;
  bagGrid: Grid;
  /** 潜入中の現在 HP（拠点では使わない） */
  hp: number;
}

export interface Stats {
  maxHp: number;
  defense: number;
  evasion: number;
  attackSpeed: number;
  maxStamina: number;
  staminaRegen: number;
}

export const BASE_STATS: Readonly<Stats> = {
  maxHp: 50, defense: 0, evasion: 0, attackSpeed: 1, maxStamina: 10, staminaRegen: 2,
};

export function createAdventurer(): Adventurer {
  return { equipment: {}, consumables: [null, null, null], bag: null, bagGrid: createGrid(0, 0), hp: 0 };
}

export function canEquip(slot: EquipSlotId, item: ItemInstance): boolean {
  const def = getDef(item.defId);
  return def.kind === 'equipment' && def.slot === SLOT_ACCEPTS[slot];
}

export function consumableSlotCount(equipment: Equipment): number {
  const belt = equipment.belt;
  return belt ? (getDef(belt.defId).consumableSlots ?? 1) : 1;
}

export function computeStats(equipment: Equipment): Stats {
  const stats: Stats = { ...BASE_STATS };
  for (const item of Object.values(equipment)) {
    if (!item) continue;
    const mods = getDef(item.defId).mods;
    if (!mods) continue;
    stats.maxHp += mods.maxHp ?? 0;
    stats.defense += mods.defense ?? 0;
    stats.evasion += mods.evasion ?? 0;
    stats.attackSpeed += mods.attackSpeed ?? 0;
    stats.maxStamina += mods.maxStamina ?? 0;
  }
  return stats;
}

export function weaponsOf(equipment: Equipment): WeaponStats[] {
  return (['rightHand', 'leftHand'] as const).flatMap((slot) => {
    const item = equipment[slot];
    const weapon = item ? getDef(item.defId).weapon : undefined;
    return weapon ? [weapon] : [];
  });
}

/** 戦闘1回分の消耗。耐久度が 0 になった装備は外れて broken に入る */
export function applyWear(adventurer: Adventurer): { adventurer: Adventurer; broken: ItemInstance[] } {
  const equipment: Equipment = {};
  const broken: ItemInstance[] = [];
  for (const slot of EQUIP_SLOTS) {
    const item = adventurer.equipment[slot];
    if (!item) continue;
    if (item.durability === null) {
      equipment[slot] = item;
      continue;
    }
    const durability = item.durability - 1;
    if (durability <= 0) broken.push({ ...item, durability: 0 });
    else equipment[slot] = { ...item, durability };
  }
  return { adventurer: { ...adventurer, equipment }, broken };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/equipment.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/equipment.ts tests/core/equipment.test.ts
git commit -m "feat(core): add equipment slots, stats and wear"
```

---

### Task 5: アイテム移動（倉庫・バッグ・装備・床）

**Files:**
- Create: `src/core/inventory.ts`
- Test: `tests/core/inventory.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/inventory.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type Adventurer, createAdventurer } from '../../src/core/equipment';
import { createGrid, findItemAt, placeItem } from '../../src/core/grid';
import { type Inventory, InventoryError, autoStore, moveItem } from '../../src/core/inventory';
import { createItem } from '../../src/core/items';

function makeInv(): Inventory {
  const adventurer: Adventurer = { ...createAdventurer(), bag: createItem('cloth_sack'), bagGrid: createGrid(4, 3) };
  return { adventurer, stash: createGrid(8, 6), loot: [] };
}

describe('inventory', () => {
  it('moves an item from stash to bag', () => {
    const sword = createItem('short_sword');
    const inv = { ...makeInv(), stash: placeItem(createGrid(8, 6), sword, 0, 0, 0) };
    const next = moveItem(inv, { kind: 'stash', uid: sword.uid }, { kind: 'bag', x: 3, y: 0, rot: 0 });
    expect(next.stash!.placements).toHaveLength(0);
    expect(findItemAt(next.adventurer.bagGrid, 3, 2)?.item.uid).toBe(sword.uid);
  });

  it('equips a weapon and rejects wrong slots', () => {
    const sword = createItem('short_sword');
    const inv = { ...makeInv(), loot: [sword] };
    const next = moveItem(inv, { kind: 'loot', uid: sword.uid }, { kind: 'equip', slot: 'rightHand' });
    expect(next.adventurer.equipment.rightHand?.uid).toBe(sword.uid);
    expect(() => moveItem(inv, { kind: 'loot', uid: sword.uid }, { kind: 'equip', slot: 'head' })).toThrow(InventoryError);
  });

  it('rejects equipping into an occupied slot', () => {
    const a = createItem('dagger');
    const b = createItem('dagger');
    const base = makeInv();
    const inv = { ...base, adventurer: { ...base.adventurer, equipment: { rightHand: a } }, loot: [b] };
    expect(() => moveItem(inv, { kind: 'loot', uid: b.uid }, { kind: 'equip', slot: 'rightHand' })).toThrow(InventoryError);
  });

  it('only allows consumable cells enabled by the belt', () => {
    const potion = createItem('potion');
    const inv = { ...makeInv(), loot: [potion] };
    expect(() => moveItem(inv, { kind: 'loot', uid: potion.uid }, { kind: 'consumable', index: 1 })).toThrow(InventoryError);
    const belted = { ...inv, adventurer: { ...inv.adventurer, equipment: { belt: createItem('rope_belt') } } };
    const next = moveItem(belted, { kind: 'loot', uid: potion.uid }, { kind: 'consumable', index: 1 });
    expect(next.adventurer.consumables[1]?.uid).toBe(potion.uid);
  });

  it('rejects non-consumables in consumable cells', () => {
    const gem = createItem('gem');
    expect(() => moveItem({ ...makeInv(), loot: [gem] }, { kind: 'loot', uid: gem.uid }, { kind: 'consumable', index: 0 })).toThrow(InventoryError);
  });

  it('blocks removing the belt while extra consumable cells are used', () => {
    const base = makeInv();
    const inv: Inventory = {
      ...base,
      adventurer: { ...base.adventurer, equipment: { belt: createItem('rope_belt') }, consumables: [null, createItem('potion'), null] },
    };
    expect(() => moveItem(inv, { kind: 'equip', slot: 'belt' }, { kind: 'loot' })).toThrow(InventoryError);
  });

  it('equips a bag and resizes the bag grid', () => {
    const pack = createItem('leather_pack');
    const base = makeInv();
    const inv: Inventory = { ...base, adventurer: { ...base.adventurer, bag: null, bagGrid: createGrid(0, 0) }, loot: [pack] };
    const next = moveItem(inv, { kind: 'loot', uid: pack.uid }, { kind: 'bagSlot' });
    expect(next.adventurer.bag?.uid).toBe(pack.uid);
    expect([next.adventurer.bagGrid.w, next.adventurer.bagGrid.h]).toEqual([5, 4]);
  });

  it('refuses to unequip a bag that still has items', () => {
    const base = makeInv();
    const inv: Inventory = { ...base, adventurer: { ...base.adventurer, bagGrid: placeItem(createGrid(4, 3), createItem('gem'), 0, 0, 0) } };
    expect(() => moveItem(inv, { kind: 'bagSlot' }, { kind: 'loot' })).toThrow(InventoryError);
  });

  it('leaves the original inventory untouched when a move fails', () => {
    const gem = createItem('gem');
    const inv = { ...makeInv(), loot: [gem] };
    expect(() => moveItem(inv, { kind: 'loot', uid: gem.uid }, { kind: 'bag', x: 10, y: 10, rot: 0 })).toThrow(InventoryError);
    expect(inv.loot).toHaveLength(1);
  });

  it('autoStore puts loot into the bag and fails when full', () => {
    const gem = createItem('gem');
    const next = autoStore({ ...makeInv(), loot: [gem] }, { kind: 'loot', uid: gem.uid }, 'bag');
    expect(next.loot).toHaveLength(0);
    expect(next.adventurer.bagGrid.placements).toHaveLength(1);
    const painting = createItem('old_painting');
    const base = makeInv();
    const tiny: Inventory = { ...base, adventurer: { ...base.adventurer, bagGrid: createGrid(1, 1) }, loot: [painting] };
    expect(() => autoStore(tiny, { kind: 'loot', uid: painting.uid }, 'bag')).toThrow(InventoryError);
  });

  it('discard removes the item', () => {
    const gem = createItem('gem');
    const next = moveItem({ ...makeInv(), loot: [gem] }, { kind: 'loot', uid: gem.uid }, { kind: 'discard' });
    expect(next.loot).toHaveLength(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/inventory.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/inventory.ts`:
```ts
import { GameError } from './errors';
import { type Adventurer, type EquipSlotId, canEquip, consumableSlotCount } from './equipment';
import { type Grid, canPlace, createGrid, placeItem, removeItem, storeItem } from './grid';
import { type ItemInstance, type Rotation, getDef } from './items';

export type Source =
  | { kind: 'stash' | 'bag' | 'loot'; uid: string }
  | { kind: 'equip'; slot: EquipSlotId }
  | { kind: 'consumable'; index: number }
  | { kind: 'bagSlot' };

export type Dest =
  | { kind: 'stash' | 'bag'; x: number; y: number; rot: Rotation }
  | { kind: 'equip'; slot: EquipSlotId }
  | { kind: 'consumable'; index: number }
  | { kind: 'bagSlot' }
  | { kind: 'loot' }
  | { kind: 'discard' };

export interface Inventory {
  adventurer: Adventurer;
  /** 潜入中は null */
  stash: Grid | null;
  /** 潜入中は今いる部屋の床。拠点では常に空 */
  loot: ItemInstance[];
}

export class InventoryError extends GameError {}

export function moveItem(inv: Inventory, src: Source, dest: Dest): Inventory {
  const taken = take(inv, src);
  return put(taken.inv, dest, taken.item);
}

export function autoStore(inv: Inventory, src: Source, target: 'bag' | 'stash'): Inventory {
  const taken = take(inv, src);
  const rest = taken.inv;
  const grid = target === 'bag' ? rest.adventurer.bagGrid : requireStash(rest);
  const stored = storeItem(grid, taken.item);
  if (!stored) throw new InventoryError(target === 'bag' ? 'バッグに空きがありません' : '倉庫に空きがありません');
  return target === 'bag'
    ? { ...rest, adventurer: { ...rest.adventurer, bagGrid: stored } }
    : { ...rest, stash: stored };
}

function requireStash(inv: Inventory): Grid {
  if (!inv.stash) throw new InventoryError('ここでは倉庫を使えません');
  return inv.stash;
}

function removeFrom(grid: Grid, uid: string): { grid: Grid; item: ItemInstance } {
  if (!grid.placements.some((p) => p.item.uid === uid)) throw new InventoryError('そのアイテムは見つかりません');
  return removeItem(grid, uid);
}

function take(inv: Inventory, src: Source): { inv: Inventory; item: ItemInstance } {
  const adv = inv.adventurer;
  switch (src.kind) {
    case 'stash': {
      const r = removeFrom(requireStash(inv), src.uid);
      return { inv: { ...inv, stash: r.grid }, item: r.item };
    }
    case 'bag': {
      const r = removeFrom(adv.bagGrid, src.uid);
      return { inv: { ...inv, adventurer: { ...adv, bagGrid: r.grid } }, item: r.item };
    }
    case 'loot': {
      const item = inv.loot.find((i) => i.uid === src.uid);
      if (!item) throw new InventoryError('そのアイテムは見つかりません');
      return { inv: { ...inv, loot: inv.loot.filter((i) => i.uid !== src.uid) }, item };
    }
    case 'equip': {
      const item = adv.equipment[src.slot];
      if (!item) throw new InventoryError('その枠は空です');
      if (src.slot === 'belt' && adv.consumables.slice(1).some((c) => c !== null)) {
        throw new InventoryError('ベルトを外す前に2番目以降の消費アイテム枠を空けてください');
      }
      const equipment = { ...adv.equipment };
      delete equipment[src.slot];
      return { inv: { ...inv, adventurer: { ...adv, equipment } }, item };
    }
    case 'consumable': {
      const item = adv.consumables[src.index] ?? null;
      if (!item) throw new InventoryError('その枠は空です');
      const consumables = adv.consumables.map((c, i) => (i === src.index ? null : c));
      return { inv: { ...inv, adventurer: { ...adv, consumables } }, item };
    }
    case 'bagSlot': {
      if (!adv.bag) throw new InventoryError('バッグを装備していません');
      if (adv.bagGrid.placements.length > 0) throw new InventoryError('バッグを空にしてから外してください');
      return { inv: { ...inv, adventurer: { ...adv, bag: null, bagGrid: createGrid(0, 0) } }, item: adv.bag };
    }
  }
}

function put(inv: Inventory, dest: Dest, item: ItemInstance): Inventory {
  const adv = inv.adventurer;
  const def = getDef(item.defId);
  switch (dest.kind) {
    case 'stash': {
      const grid = requireStash(inv);
      if (!canPlace(grid, item, dest.x, dest.y, dest.rot)) throw new InventoryError('そこには置けません');
      return { ...inv, stash: placeItem(grid, item, dest.x, dest.y, dest.rot) };
    }
    case 'bag': {
      if (!canPlace(adv.bagGrid, item, dest.x, dest.y, dest.rot)) throw new InventoryError('そこには置けません');
      return { ...inv, adventurer: { ...adv, bagGrid: placeItem(adv.bagGrid, item, dest.x, dest.y, dest.rot) } };
    }
    case 'loot':
      return { ...inv, loot: [...inv.loot, item] };
    case 'discard':
      return inv;
    case 'equip': {
      if (!canEquip(dest.slot, item)) throw new InventoryError('その枠には装備できません');
      if (adv.equipment[dest.slot]) throw new InventoryError('その枠は使用中です（先に外してください）');
      return { ...inv, adventurer: { ...adv, equipment: { ...adv.equipment, [dest.slot]: item } } };
    }
    case 'consumable': {
      if (def.kind !== 'consumable') throw new InventoryError('消費アイテムではありません');
      if (dest.index >= consumableSlotCount(adv.equipment)) throw new InventoryError('その消費アイテム枠は使えません（ベルトが必要）');
      if (adv.consumables[dest.index]) throw new InventoryError('その枠は使用中です');
      return { ...inv, adventurer: { ...adv, consumables: adv.consumables.map((c, i) => (i === dest.index ? item : c)) } };
    }
    case 'bagSlot': {
      if (def.kind !== 'bag' || !def.bagSize) throw new InventoryError('バッグではありません');
      if (adv.bag) throw new InventoryError('すでにバッグを装備しています');
      return { ...inv, adventurer: { ...adv, bag: item, bagGrid: createGrid(def.bagSize.w, def.bagSize.h) } };
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/inventory.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/inventory.ts tests/core/inventory.test.ts
git commit -m "feat(core): add item moves between stash, bag, equipment and floor"
```

---

### Task 6: モンスターと戦利品テーブル

**Files:**
- Create: `src/core/monsters.ts`, `src/core/loot.ts`
- Test: `tests/core/loot.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/loot.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CHEST_TABLE, SHOP_POOL, rollChest, rollMonsterDrops, rollShopStock } from '../../src/core/loot';
import { MONSTERS, MONSTER_IDS, getMonster } from '../../src/core/monsters';
import { getDef } from '../../src/core/items';
import { createRng } from '../../src/core/rng';

describe('monsters and loot', () => {
  it('every referenced item id exists', () => {
    for (const m of Object.values(MONSTERS)) for (const d of m.drops) expect(() => getDef(d.defId)).not.toThrow();
    for (const e of CHEST_TABLE) expect(() => getDef(e.defId)).not.toThrow();
    for (const id of SHOP_POOL) expect(() => getDef(id)).not.toThrow();
  });

  it('getMonster throws for unknown ids', () => {
    expect(() => getMonster('dragon')).toThrow();
    expect(MONSTER_IDS.length).toBeGreaterThan(0);
  });

  it('monster drops are deterministic and gold stays in range', () => {
    const m = getMonster('goblin');
    const a = rollMonsterDrops(m, createRng(9)).map((i) => [i.defId, i.qty]);
    const b = rollMonsterDrops(m, createRng(9)).map((i) => [i.defId, i.qty]);
    expect(a).toEqual(b);
    for (let seed = 0; seed < 50; seed++) {
      const gold = rollMonsterDrops(m, createRng(seed)).find((i) => i.defId === 'gold');
      if (gold) {
        expect(gold.qty).toBeGreaterThanOrEqual(m.gold[0]);
        expect(gold.qty).toBeLessThanOrEqual(m.gold[1]);
      }
    }
  });

  it('chests contain 1-3 items plus gold', () => {
    for (let seed = 0; seed < 30; seed++) {
      const items = rollChest(createRng(seed));
      const nonGold = items.filter((i) => i.defId !== 'gold');
      expect(nonGold.length).toBeGreaterThanOrEqual(1);
      expect(nonGold.length).toBeLessThanOrEqual(3);
      expect(items.some((i) => i.defId === 'gold')).toBe(true);
    }
  });

  it('shop stock comes from the shop pool', () => {
    const stock = rollShopStock(createRng(4));
    expect(stock).toHaveLength(6);
    for (const item of stock) expect(SHOP_POOL).toContain(item.defId);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/loot.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/monsters.ts`:
```ts
import type { WeaponStats } from './items';

export interface MonsterDef {
  id: string;
  name: string;
  icon: string;
  maxHp: number;
  defense: number;
  evasion: number;
  weapon: WeaponStats;
  drops: readonly { defId: string; chance: number }[];
  gold: readonly [number, number];
}

const DEFS: MonsterDef[] = [
  { id: 'rat', name: '大ネズミ', icon: '🐀', maxHp: 15, defense: 0, evasion: 0.1, weapon: { damage: 2, cooldown: 1.0, staminaCost: 0 },
    drops: [{ defId: 'black_bread', chance: 0.3 }], gold: [0, 5] },
  { id: 'goblin', name: 'ゴブリン', icon: '👺', maxHp: 25, defense: 0, evasion: 0.15, weapon: { damage: 4, cooldown: 1.2, staminaCost: 0 },
    drops: [{ defId: 'dagger', chance: 0.2 }, { defId: 'gloves', chance: 0.1 }, { defId: 'rope_belt', chance: 0.15 }, { defId: 'potion', chance: 0.2 }], gold: [5, 20] },
  { id: 'skeleton', name: '骸骨兵', icon: '💀', maxHp: 30, defense: 1, evasion: 0, weapon: { damage: 5, cooldown: 1.6, staminaCost: 0 },
    drops: [{ defId: 'short_sword', chance: 0.1 }, { defId: 'leather_cap', chance: 0.15 }, { defId: 'silver_cup', chance: 0.2 }], gold: [3, 15] },
  { id: 'ghoul', name: '屍食鬼', icon: '🧟', maxHp: 45, defense: 2, evasion: 0, weapon: { damage: 7, cooldown: 2.0, staminaCost: 0 },
    drops: [{ defId: 'leather_armor', chance: 0.15 }, { defId: 'ring_vigor', chance: 0.05 }, { defId: 'gem', chance: 0.15 }], gold: [10, 30] },
];

export const MONSTERS: Readonly<Record<string, MonsterDef>> = Object.fromEntries(DEFS.map((m) => [m.id, m]));
export const MONSTER_IDS: readonly string[] = DEFS.map((m) => m.id);

export function getMonster(id: string): MonsterDef {
  const m = MONSTERS[id];
  if (!m) throw new Error(`unknown monster: ${id}`);
  return m;
}
```

`src/core/loot.ts`:
```ts
import { GOLD_ID, type ItemInstance, createItem } from './items';
import type { MonsterDef } from './monsters';
import type { Rng } from './rng';

export const CHEST_TABLE: readonly { defId: string; weight: number }[] = [
  { defId: 'potion', weight: 6 }, { defId: 'silver_cup', weight: 6 }, { defId: 'gem', weight: 3 },
  { defId: 'gold_idol', weight: 2 }, { defId: 'old_painting', weight: 2 },
  { defId: 'dagger', weight: 3 }, { defId: 'club', weight: 2 }, { defId: 'short_sword', weight: 2 }, { defId: 'war_axe', weight: 1 },
  { defId: 'leather_cap', weight: 3 }, { defId: 'leather_armor', weight: 2 }, { defId: 'chain_mail', weight: 1 },
  { defId: 'leather_pants', weight: 3 }, { defId: 'boots', weight: 3 }, { defId: 'gloves', weight: 3 }, { defId: 'bracers', weight: 3 },
  { defId: 'rope_belt', weight: 3 }, { defId: 'leather_belt', weight: 1 },
  { defId: 'ring_guard', weight: 1 }, { defId: 'ring_vigor', weight: 1 }, { defId: 'amulet_life', weight: 1 },
  { defId: 'leather_pack', weight: 1 },
];

export const SHOP_POOL: readonly string[] = [
  'dagger', 'club', 'short_sword', 'leather_cap', 'leather_armor', 'leather_pants', 'boots', 'gloves',
  'bracers', 'rope_belt', 'leather_belt', 'potion', 'leather_pack',
];

function weightedPick(table: readonly { defId: string; weight: number }[], rng: Rng): string {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = rng.next() * total;
  for (const e of table) {
    roll -= e.weight;
    if (roll < 0) return e.defId;
  }
  return table[table.length - 1].defId;
}

export function rollMonsterDrops(monster: MonsterDef, rng: Rng): ItemInstance[] {
  const items = monster.drops.filter((d) => rng.chance(d.chance)).map((d) => createItem(d.defId));
  const gold = rng.int(monster.gold[0], monster.gold[1]);
  if (gold > 0) items.push(createItem(GOLD_ID, gold));
  return items;
}

export function rollChest(rng: Rng): ItemInstance[] {
  const count = rng.int(1, 3);
  const items = Array.from({ length: count }, () => createItem(weightedPick(CHEST_TABLE, rng)));
  items.push(createItem(GOLD_ID, rng.int(5, 40)));
  return items;
}

export function rollShopStock(rng: Rng, count = 6): ItemInstance[] {
  return Array.from({ length: count }, () => createItem(rng.pick(SHOP_POOL)));
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/loot.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/monsters.ts src/core/loot.ts tests/core/loot.test.ts
git commit -m "feat(core): add monsters, drops, chests and shop stock"
```

---

### Task 7: クールタイム制オートバトル

**Files:**
- Create: `src/core/combat.ts`
- Test: `tests/core/combat.test.ts`

仕様：0.1 秒刻みで進める。各ティックでは、側 0（プレイヤー）→ 側 1 の順に、次の処理を行う。

1. スタミナを回復する
2. 各武器のタイマーを `TICK × 攻撃速度` だけ進める。クールタイムに達し、スタミナが足りていれば攻撃する（回避判定のあと、ダメージ = max(1, 武器ダメージ − 防御)）
3. 定期回復の効果を処理する
4. 条件を満たした消費アイテムを1つ使う

15 秒目からは、毎秒、両者に疲労ダメージ（1, 2, 3, …）が入る。両者が同時に倒れた場合は、側 1 の勝ち（プレイヤーの負け）とする。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/combat.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type Fighter, FATIGUE_START, simulateCombat } from '../../src/core/combat';
import { BASE_STATS } from '../../src/core/equipment';
import { createRng } from '../../src/core/rng';

function makeFighter(over: Partial<Fighter> = {}): Fighter {
  return {
    name: 'テスト', icon: '🧪', stats: { ...BASE_STATS }, hp: BASE_STATS.maxHp,
    weapons: [{ damage: 5, cooldown: 1, staminaCost: 0 }], periodicHeals: [], consumables: [], ...over,
  };
}

describe('combat', () => {
  it('is deterministic for the same seed', () => {
    const a = makeFighter({ stats: { ...BASE_STATS, evasion: 0.3 } });
    const b = makeFighter({ stats: { ...BASE_STATS, evasion: 0.3 } });
    expect(simulateCombat(a, b, createRng(11))).toEqual(simulateCombat(a, b, createRng(11)));
  });

  it('the stronger fighter wins', () => {
    const a = makeFighter({ weapons: [{ damage: 10, cooldown: 1, staminaCost: 0 }] });
    const b = makeFighter({ weapons: [{ damage: 1, cooldown: 1, staminaCost: 0 }] });
    const r = simulateCombat(a, b, createRng(1));
    expect(r.winner).toBe(0);
    expect(r.finalHp[1]).toBe(0);
  });

  it('defense reduces damage but never below 1', () => {
    const r = simulateCombat(makeFighter(), makeFighter({ stats: { ...BASE_STATS, defense: 100 } }), createRng(1));
    const firstHit = r.events.find((e) => e.kind === 'hit' && e.actor === 0);
    expect(firstHit && firstHit.kind === 'hit' ? firstHit.damage : -1).toBe(1);
  });

  it('evasion 1 makes every attack miss', () => {
    const r = simulateCombat(makeFighter(), makeFighter({ stats: { ...BASE_STATS, evasion: 1 } }), createRng(1));
    expect(r.events.filter((e) => e.kind === 'hit' && e.actor === 0)).toHaveLength(0);
    expect(r.events.some((e) => e.kind === 'miss' && e.actor === 0)).toBe(true);
  });

  it('weapons wait for stamina', () => {
    const a = makeFighter({
      stats: { ...BASE_STATS, maxStamina: 2, staminaRegen: 0 },
      weapons: [{ damage: 1, cooldown: 1, staminaCost: 1 }],
    });
    const b = makeFighter({ hp: 1000, stats: { ...BASE_STATS, maxHp: 1000 } });
    const r = simulateCombat(a, b, createRng(1));
    expect(r.events.filter((e) => e.kind === 'hit' && e.actor === 0)).toHaveLength(2);
  });

  it('uses a consumable when HP drops below the threshold', () => {
    const a = makeFighter({ hp: 20, consumables: [{ uid: 'p1', name: 'ポーション', effect: { hpBelow: 0.5, heal: 20 } }] });
    const r = simulateCombat(a, makeFighter(), createRng(1));
    expect(r.usedConsumables).toEqual(['p1']);
    const heal = r.events.find((e) => e.kind === 'heal');
    expect(heal).toMatchObject({ t: 0.1, actor: 0, amount: 20, hp: 40 });
  });

  it('periodic heals trigger on their interval', () => {
    const a = makeFighter({ hp: 40, weapons: [], periodicHeals: [{ every: 5, heal: 2 }] });
    const r = simulateCombat(a, makeFighter({ weapons: [] }), createRng(1));
    expect(r.events.find((e) => e.kind === 'heal')).toMatchObject({ t: 5, actor: 0, amount: 2, hp: 42 });
  });

  it('fatigue ends stalemates and a double KO counts as a loss for side 0', () => {
    const r = simulateCombat(makeFighter({ weapons: [] }), makeFighter({ weapons: [] }), createRng(1));
    const first = r.events.find((e) => e.kind === 'fatigue');
    expect(first?.t).toBe(FATIGUE_START);
    expect(r.duration).toBe(24);
    expect(r.winner).toBe(1);
  });

  it('reports start and max HP for playback', () => {
    const r = simulateCombat(makeFighter({ hp: 30 }), makeFighter(), createRng(1));
    expect(r.startHp).toEqual([30, 50]);
    expect(r.maxHp).toEqual([50, 50]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/combat.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/combat.ts`:
```ts
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/combat.test.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/combat.ts tests/core/combat.test.ts
git commit -m "feat(core): add cooldown-based auto battle simulation"
```

---

### Task 8: ダンジョン生成と瘴気

**Files:**
- Create: `src/core/dungeon.ts`
- Test: `tests/core/dungeon.test.ts`

仕様：

- 5×5 の部屋。ランダム DFS で全域木を作り、さらに隣接した部屋どうしの通路を 4 本追加する。
- 開始地点は外周（リング 2）からランダムに選ぶ。
- 脱出口は、開始地点からマンハッタン距離 4 以上の部屋から 2 つ選ぶ。
- 残りの部屋には、モンスター 8、宝箱 5、罠 3、泉 1 を割り当て、残りは空き部屋にする。
- 瘴気は、リング 2 が 30 ターン目、リング 1 が 45 ターン目、中央が 60 ターン目に閉鎖される。
- 脱出口は 12 ターン目に開く。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/dungeon.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  DUNGEON_SIZE, EXIT_OPEN_TURN, generateDungeon, isClosed, isExitOpen, neighbors, ringOf, turnsUntilClosed,
} from '../../src/core/dungeon';
import { MONSTER_IDS } from '../../src/core/monsters';
import { createRng } from '../../src/core/rng';

const gen = (seed: number) => generateDungeon(createRng(seed), MONSTER_IDS);

describe('dungeon', () => {
  it('creates a 5x5 map', () => {
    const d = gen(1);
    expect(d.size).toBe(DUNGEON_SIZE);
    expect(d.rooms).toHaveLength(25);
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

  it('places the expected room types', () => {
    for (let seed = 0; seed < 20; seed++) {
      const d = gen(seed);
      const count = (type: string) => d.rooms.filter((r) => r.type === type).length;
      expect(count('exit')).toBe(2);
      expect(count('monster')).toBe(8);
      expect(count('chest')).toBe(5);
      expect(count('trap')).toBe(3);
      expect(count('spring')).toBe(1);
      expect(d.rooms[d.start].type).toBe('empty');
      expect(d.exits).not.toContain(d.start);
      expect(ringOf(d.rooms[d.start], d.size)).toBe(2);
      for (const r of d.rooms.filter((x) => x.type === 'monster')) expect(MONSTER_IDS).toContain(r.monsterId);
    }
  });

  it('starts with only the start room visited', () => {
    const d = gen(5);
    expect(d.rooms.filter((r) => r.visited).map((r) => r.index)).toEqual([d.start]);
  });

  it('is deterministic for the same seed', () => {
    const strip = (seed: number) => JSON.stringify({ ...gen(seed), rooms: gen(seed).rooms.map((r) => r.type) });
    expect(strip(8)).toBe(strip(8));
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

  it('opens exits at the configured turn', () => {
    expect(isExitOpen(EXIT_OPEN_TURN - 1)).toBe(false);
    expect(isExitOpen(EXIT_OPEN_TURN)).toBe(true);
  });
});
```

注：`is deterministic` テストでは、`ItemInstance` の uid は比較しない（生成時の床は空なので影響はない）。

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/dungeon.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/dungeon.ts`:
```ts
import type { ItemInstance } from './items';
import type { Rng } from './rng';

export type RoomType = 'empty' | 'monster' | 'chest' | 'trap' | 'spring' | 'exit';

export interface Room {
  index: number;
  x: number;
  y: number;
  type: RoomType;
  monsterId: string | null;
  visited: boolean;
  /** モンスター撃破済み / 宝箱開封済み / 泉使用済み / 罠発動済み */
  cleared: boolean;
  floor: ItemInstance[];
}

export interface Dungeon {
  size: number;
  rooms: Room[];
  links: [number, number][];
  start: number;
  exits: number[];
}

export const DUNGEON_SIZE = 5;
export const EXTRA_LINKS = 4;
export const EXIT_COUNT = 2;
export const EXIT_OPEN_TURN = 12;
export const MIASMA_SCHEDULE: readonly { ring: number; turn: number }[] = [
  { ring: 2, turn: 30 },
  { ring: 1, turn: 45 },
  { ring: 0, turn: 60 },
];
export const MIASMA_WARNING = 5;

const ROOM_PLAN: readonly [RoomType, number][] = [['monster', 8], ['chest', 5], ['trap', 3], ['spring', 1]];

export function ringOf(room: { x: number; y: number }, size: number): number {
  const c = (size - 1) / 2;
  return Math.max(Math.abs(room.x - c), Math.abs(room.y - c));
}

export function turnsUntilClosed(room: { x: number; y: number }, size: number, turn: number): number | null {
  const entry = MIASMA_SCHEDULE.find((s) => s.ring === ringOf(room, size));
  return entry ? entry.turn - turn : null;
}

export function isClosed(room: { x: number; y: number }, size: number, turn: number): boolean {
  const left = turnsUntilClosed(room, size, turn);
  return left !== null && left <= 0;
}

export function isExitOpen(turn: number): boolean {
  return turn >= EXIT_OPEN_TURN;
}

export function neighbors(d: Dungeon, index: number): number[] {
  return d.links.flatMap(([a, b]) => (a === index ? [b] : b === index ? [a] : []));
}

function gridNeighbors(index: number, size: number): number[] {
  const x = index % size;
  const y = Math.floor(index / size);
  const out: number[] = [];
  if (x > 0) out.push(index - 1);
  if (x < size - 1) out.push(index + 1);
  if (y > 0) out.push(index - size);
  if (y < size - 1) out.push(index + size);
  return out;
}

function pair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function generateDungeon(rng: Rng, monsterIds: readonly string[]): Dungeon {
  const size = DUNGEON_SIZE;
  const rooms: Room[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      rooms.push({ index: y * size + x, x, y, type: 'empty', monsterId: null, visited: false, cleared: false, floor: [] });
    }
  }
  const start = rng.pick(rooms.filter((r) => ringOf(r, size) === (size - 1) / 2)).index;

  const links: [number, number][] = [];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const options = gridNeighbors(cur, size).filter((i) => !seen.has(i));
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const next = rng.pick(options);
    links.push(pair(cur, next));
    seen.add(next);
    stack.push(next);
  }
  let added = 0;
  for (let attempt = 0; attempt < 100 && added < EXTRA_LINKS; attempt++) {
    const a = rng.int(0, size * size - 1);
    const [p, q] = pair(a, rng.pick(gridNeighbors(a, size)));
    if (!links.some(([l1, l2]) => l1 === p && l2 === q)) {
      links.push([p, q]);
      added++;
    }
  }

  const s = rooms[start];
  const far = rooms.filter((r) => Math.abs(r.x - s.x) + Math.abs(r.y - s.y) >= 4);
  const exits = rng.shuffle(far).slice(0, EXIT_COUNT).map((r) => r.index);
  for (const e of exits) rooms[e].type = 'exit';

  const rest = rng.shuffle(rooms.filter((r) => r.index !== start && !exits.includes(r.index)));
  let cursor = 0;
  for (const [type, count] of ROOM_PLAN) {
    for (let i = 0; i < count; i++) {
      const room = rest[cursor++];
      room.type = type;
      if (type === 'monster') room.monsterId = rng.pick(monsterIds);
    }
  }

  rooms[start].visited = true;
  rooms[start].cleared = true;
  return { size, rooms, links, start, exits };
}

/** 隣の未訪問の部屋から感じ取れる気配 */
export function roomHint(room: Room): string {
  switch (room.type) {
    case 'monster': return '物音がする';
    case 'chest': return '金属の匂い';
    case 'trap': return '嫌な気配';
    case 'spring': return '水音';
    case 'exit': return '冷たい風';
    case 'empty': return '静か';
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/dungeon.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/dungeon.ts tests/core/dungeon.test.ts
git commit -m "feat(core): add room map generation, miasma and exits"
```

---

### Task 9: 潜入中の行動

**Files:**
- Create: `src/core/raid.ts`
- Test: `tests/core/raid.test.ts`

行動にかかるターン：移動 1、戦闘 +2、宝箱 1、泉 1、脱出 3。

1 ターン進むごとに、瘴気が広がったかを判定する。閉鎖された部屋にいると 6 ダメージを受ける。罠の部屋に初めて入ると、回避判定に失敗した場合に 8 ダメージを受ける。

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/raid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { type Room, EXIT_OPEN_TURN, neighbors } from '../../src/core/dungeon';
import { type Adventurer, createAdventurer } from '../../src/core/equipment';
import { createGrid } from '../../src/core/grid';
import { createItem } from '../../src/core/items';
import {
  type RaidState, ESCAPE_TURNS, MIASMA_DAMAGE, RaidError, TRAP_DAMAGE,
  currentRoom, drinkSpring, escape, moveRaidItem, moveTo, openChest, pickUp, startRaid,
} from '../../src/core/raid';
import { createRng } from '../../src/core/rng';

function setup(seed = 1) {
  const rng = createRng(seed);
  const adv: Adventurer = {
    ...createAdventurer(),
    bag: createItem('cloth_sack'),
    bagGrid: createGrid(4, 3),
    equipment: { rightHand: createItem('short_sword') },
  };
  return { state: startRaid(adv, rng), rng };
}

function withRoom(state: RaidState, index: number, patch: Partial<Room>): RaidState {
  const s = structuredClone(state);
  Object.assign(s.dungeon.rooms[index], patch);
  return s;
}

describe('raid', () => {
  it('starts at the start room with full HP', () => {
    const { state } = setup();
    expect(state.pos).toBe(state.dungeon.start);
    expect(state.turn).toBe(0);
    expect(state.adventurer.hp).toBe(50);
    expect(state.status).toBe('exploring');
  });

  it('rejects moves to rooms that are not linked', () => {
    const { state, rng } = setup();
    const linked = neighbors(state.dungeon, state.pos);
    const target = state.dungeon.rooms.find((r) => r.index !== state.pos && !linked.includes(r.index))!.index;
    expect(() => moveTo(state, target, rng)).toThrow(RaidError);
  });

  it('moving costs a turn and marks the room visited', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const next = moveTo(withRoom(state, target, { type: 'empty' }), target, rng);
    expect(next.pos).toBe(target);
    expect(next.turn).toBe(1);
    expect(next.dungeon.rooms[target].visited).toBe(true);
    expect(state.turn).toBe(0);
  });

  it('fights a monster on entry, clears the room and wears equipment', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const next = moveTo(withRoom(state, target, { type: 'monster', monsterId: 'rat', cleared: false }), target, rng);
    expect(next.lastBattle?.monsterId).toBe('rat');
    expect(next.lastBattle?.result.winner).toBe(0);
    expect(next.status).toBe('exploring');
    expect(next.dungeon.rooms[target].cleared).toBe(true);
    expect(next.turn).toBe(3);
    expect(next.adventurer.equipment.rightHand?.durability).toBe(24);
  });

  it('dies when losing a fight', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const weak = structuredClone(withRoom(state, target, { type: 'monster', monsterId: 'ghoul', cleared: false }));
    weak.adventurer.equipment = {};
    weak.adventurer.hp = 1;
    const next = moveTo(weak, target, rng);
    expect(next.status).toBe('dead');
    expect(next.adventurer.hp).toBe(0);
  });

  it('traps deal damage once', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const next = moveTo(withRoom(state, target, { type: 'trap', cleared: false }), target, rng);
    expect(next.adventurer.hp).toBe(50 - TRAP_DAMAGE);
    expect(next.dungeon.rooms[target].cleared).toBe(true);
  });

  it('opening a chest drops loot on the floor', () => {
    const { state, rng } = setup();
    const next = openChest(withRoom(state, state.pos, { type: 'chest', cleared: false }), rng);
    expect(currentRoom(next).floor.length).toBeGreaterThanOrEqual(2);
    expect(currentRoom(next).cleared).toBe(true);
    expect(next.turn).toBe(1);
    expect(() => openChest(next, rng)).toThrow(RaidError);
  });

  it('the spring heals half of max HP once', () => {
    const { state } = setup();
    const hurt = structuredClone(withRoom(state, state.pos, { type: 'spring', cleared: false }));
    hurt.adventurer.hp = 10;
    const next = drinkSpring(hurt);
    expect(next.adventurer.hp).toBe(35);
    expect(() => drinkSpring(next)).toThrow(RaidError);
  });

  it('picks up floor items into the bag', () => {
    const { state } = setup();
    const gem = createItem('gem');
    const next = pickUp(withRoom(state, state.pos, { floor: [gem] }), gem.uid);
    expect(currentRoom(next).floor).toHaveLength(0);
    expect(next.adventurer.bagGrid.placements[0].item.uid).toBe(gem.uid);
  });

  it('drops a bag item onto the floor', () => {
    const { state } = setup();
    const gem = createItem('gem');
    const picked = pickUp(withRoom(state, state.pos, { floor: [gem] }), gem.uid);
    const dropped = moveRaidItem(picked, { kind: 'bag', uid: gem.uid }, { kind: 'loot' });
    expect(currentRoom(dropped).floor.map((i) => i.uid)).toEqual([gem.uid]);
  });

  it('escapes from an open exit', () => {
    const { state } = setup();
    const atExit = structuredClone(withRoom(state, state.pos, { type: 'exit' }));
    atExit.turn = EXIT_OPEN_TURN;
    const next = escape(atExit);
    expect(next.status).toBe('escaped');
    expect(next.turn).toBe(EXIT_OPEN_TURN + ESCAPE_TURNS);
  });

  it('cannot escape before the exit opens', () => {
    const { state } = setup();
    expect(() => escape(withRoom(state, state.pos, { type: 'exit' }))).toThrow(RaidError);
  });

  it('miasma damages the adventurer in a closed room', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.turn = 29;
    const next = openChest(s, rng);
    expect(next.turn).toBe(30);
    expect(next.adventurer.hp).toBe(50 - MIASMA_DAMAGE);
  });

  it('miasma can kill', () => {
    const { state, rng } = setup();
    const s = structuredClone(withRoom(state, state.pos, { type: 'chest', cleared: false }));
    s.turn = 29;
    s.adventurer.hp = 3;
    const next = openChest(s, rng);
    expect(next.status).toBe('dead');
    expect(() => openChest(next, rng)).toThrow(RaidError);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/raid.ts`:
```ts
import { type CombatResult, fighterFromAdventurer, fighterFromMonster, simulateCombat } from './combat';
import {
  type Dungeon, EXIT_OPEN_TURN, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  generateDungeon, isClosed, isExitOpen, neighbors,
} from './dungeon';
import { type Adventurer, applyWear, computeStats } from './equipment';
import { GameError } from './errors';
import { type Dest, type Inventory, type Source, autoStore, moveItem } from './inventory';
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

export function pickUp(state: RaidState, uid: string): RaidState {
  return withInventory(state, (inv) => autoStore(inv, { kind: 'loot', uid }, 'bag'));
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/raid.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/raid.ts tests/core/raid.test.ts
git commit -m "feat(core): add raid actions (move, fight, chest, spring, escape)"
```

---

### Task 10: 拠点（プロフィール、商人、潜入の開始と終了）

**Files:**
- Create: `src/core/town.ts`
- Test: `tests/core/town.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/town.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createAdventurer } from '../../src/core/equipment';
import { countGold, placeItem, storeItem } from '../../src/core/grid';
import { createItem } from '../../src/core/items';
import type { RaidState } from '../../src/core/raid';
import { createRng } from '../../src/core/rng';
import {
  TownError, beginRaid, buy, buyPrice, createProfile, expandStash, finishRaid, moveTownItem, sellFromStash, withFreeKit,
} from '../../src/core/town';

describe('town', () => {
  it('creates an empty profile with a shop', () => {
    const p = createProfile(createRng(1));
    expect(p.gold).toBe(0);
    expect([p.stash.w, p.stash.h]).toEqual([8, 6]);
    expect(p.shop).toHaveLength(6);
    expect(p.raids).toBe(0);
  });

  it('free kit fills only empty slots', () => {
    const sword = createItem('short_sword');
    const kit = withFreeKit({ ...createAdventurer(), equipment: { rightHand: sword } });
    expect(kit.equipment.rightHand?.uid).toBe(sword.uid);
    expect(kit.equipment.body?.defId).toBe('rag_shirt');
    expect(kit.bag?.defId).toBe('cloth_sack');
    expect([kit.bagGrid.w, kit.bagGrid.h]).toEqual([4, 3]);
    expect(kit.consumables[0]?.defId).toBe('black_bread');
  });

  it('buying needs enough gold and stash space', () => {
    const p = createProfile(createRng(1));
    expect(() => buy(p, 0)).toThrow(TownError);
    const rich = { ...p, gold: 1000 };
    const price = buyPrice(rich.shop[0]);
    const after = buy(rich, 0);
    expect(after.gold).toBe(1000 - price);
    expect(after.stash.placements).toHaveLength(1);
    expect(after.shop).toHaveLength(5);
  });

  it('selling adds the item value', () => {
    const gem = createItem('gem');
    const p = { ...createProfile(createRng(1)), stash: placeItem(createProfile(createRng(1)).stash, gem, 0, 0, 0) };
    const after = sellFromStash(p, gem.uid);
    expect(after.gold).toBe(60);
    expect(after.stash.placements).toHaveLength(0);
  });

  it('expanding the stash costs gold', () => {
    const p = { ...createProfile(createRng(1)), gold: 100 };
    const after = expandStash(p);
    expect(after.stash.h).toBe(7);
    expect(after.gold).toBe(0);
    expect(() => expandStash(after)).toThrow(TownError);
  });

  it('moves items from the stash to equipment', () => {
    const sword = createItem('short_sword');
    const base = createProfile(createRng(1));
    const p = { ...base, stash: placeItem(base.stash, sword, 0, 0, 0) };
    const after = moveTownItem(p, { kind: 'stash', uid: sword.uid }, { kind: 'equip', slot: 'rightHand' });
    expect(after.loadout.equipment.rightHand?.uid).toBe(sword.uid);
    expect(() => moveTownItem(after, { kind: 'equip', slot: 'rightHand' }, { kind: 'loot' })).toThrow(TownError);
  });

  it('beginRaid empties the loadout and equips the free kit for the raid', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    expect(profile.loadout.equipment).toEqual({});
    expect(raid.adventurer.equipment.rightHand?.defId).toBe('rusty_dagger');
  });

  it('finishRaid after escaping keeps gear and converts bag gold', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    const escaped: RaidState = structuredClone(raid);
    escaped.status = 'escaped';
    escaped.adventurer.bagGrid = storeItem(storeItem(escaped.adventurer.bagGrid, createItem('gold', 40))!, createItem('gem'))!;
    const after = finishRaid(profile, escaped, rng);
    expect(after.gold).toBe(40);
    expect(countGold(after.loadout.bagGrid)).toBe(0);
    expect(after.loadout.bagGrid.placements.map((p) => p.item.defId)).toEqual(['gem']);
    expect(after.loadout.equipment.rightHand?.defId).toBe('rusty_dagger');
    expect(after.raids).toBe(1);
  });

  it('finishRaid after death loses everything carried', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    const dead: RaidState = { ...raid, status: 'dead' };
    const after = finishRaid(profile, dead, rng);
    expect(after.loadout.equipment).toEqual({});
    expect(after.loadout.bag).toBeNull();
  });

  it('finishRaid refuses an ongoing raid', () => {
    const rng = createRng(1);
    const { profile, raid } = beginRaid(createProfile(rng), rng);
    expect(() => finishRaid(profile, raid, rng)).toThrow();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/town.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/town.ts`:
```ts
import { type Adventurer, createAdventurer } from './equipment';
import { GameError } from './errors';
import { type Grid, createGrid, removeAllGold, removeItem, storeItem } from './grid';
import { type Dest, type Source, moveItem } from './inventory';
import { type ItemInstance, createItem, getDef } from './items';
import { rollShopStock } from './loot';
import { type RaidState, startRaid } from './raid';
import type { Rng } from './rng';

export interface Profile {
  gold: number;
  stash: Grid;
  /** 次の潜入に持ち込む手持ち（装備とバッグ） */
  loadout: Adventurer;
  shop: ItemInstance[];
  raids: number;
}

export class TownError extends GameError {}

export const STASH_START_W = 8;
export const STASH_START_H = 6;
export const STASH_MAX_HEIGHT = 12;

export const FREE_KIT = {
  rightHand: 'rusty_dagger',
  body: 'rag_shirt',
  bag: 'cloth_sack',
  consumable: 'black_bread',
} as const;

export function createProfile(rng: Rng): Profile {
  return {
    gold: 0,
    stash: createGrid(STASH_START_W, STASH_START_H),
    loadout: createAdventurer(),
    shop: rollShopStock(rng),
    raids: 0,
  };
}

export function sellPrice(item: ItemInstance): number {
  return getDef(item.defId).value * item.qty;
}

export function buyPrice(item: ItemInstance): number {
  return Math.max(1, getDef(item.defId).value * 2);
}

export function stashExpandCost(profile: Profile): number {
  return 100 * (profile.stash.h - 5);
}

export function withFreeKit(adventurer: Adventurer): Adventurer {
  const next = structuredClone(adventurer);
  if (!next.equipment.rightHand) next.equipment.rightHand = createItem(FREE_KIT.rightHand);
  if (!next.equipment.body) next.equipment.body = createItem(FREE_KIT.body);
  if (!next.bag) {
    const bag = createItem(FREE_KIT.bag);
    const size = getDef(bag.defId).bagSize!;
    next.bag = bag;
    next.bagGrid = createGrid(size.w, size.h);
  }
  if (!next.consumables[0]) next.consumables[0] = createItem(FREE_KIT.consumable);
  return next;
}

export function buy(profile: Profile, index: number): Profile {
  const item = profile.shop[index];
  if (!item) throw new TownError('その商品はありません');
  const price = buyPrice(item);
  if (profile.gold < price) throw new TownError('金貨が足りません');
  const stash = storeItem(profile.stash, item);
  if (!stash) throw new TownError('倉庫に空きがありません');
  return { ...profile, gold: profile.gold - price, stash, shop: profile.shop.filter((_, i) => i !== index) };
}

export function sellFromStash(profile: Profile, uid: string): Profile {
  const placement = profile.stash.placements.find((p) => p.item.uid === uid);
  if (!placement) throw new TownError('倉庫にないアイテムです');
  return { ...profile, stash: removeItem(profile.stash, uid).grid, gold: profile.gold + sellPrice(placement.item) };
}

export function expandStash(profile: Profile): Profile {
  if (profile.stash.h >= STASH_MAX_HEIGHT) throw new TownError('これ以上拡張できません');
  const cost = stashExpandCost(profile);
  if (profile.gold < cost) throw new TownError('金貨が足りません');
  return { ...profile, gold: profile.gold - cost, stash: { ...profile.stash, h: profile.stash.h + 1 } };
}

export function moveTownItem(profile: Profile, src: Source, dest: Dest): Profile {
  if (dest.kind === 'loot') throw new TownError('拠点では床に置けません');
  const inv = moveItem({ adventurer: profile.loadout, stash: profile.stash, loot: [] }, src, dest);
  return { ...profile, loadout: inv.adventurer, stash: inv.stash ?? profile.stash };
}

/** 手持ちにボロ装備を補って潜入を開始する。拠点の手持ちは空になる（潜入中のリロードはロスト扱い） */
export function beginRaid(profile: Profile, rng: Rng): { profile: Profile; raid: RaidState } {
  const raid = startRaid(withFreeKit(profile.loadout), rng);
  return { profile: { ...profile, loadout: createAdventurer() }, raid };
}

export function finishRaid(profile: Profile, raid: RaidState, rng: Rng): Profile {
  if (raid.status === 'exploring') throw new Error('raid is still in progress');
  const base = { ...profile, raids: profile.raids + 1, shop: rollShopStock(rng) };
  if (raid.status === 'dead') return { ...base, loadout: createAdventurer() };
  const { grid, amount } = removeAllGold(raid.adventurer.bagGrid);
  return { ...base, gold: profile.gold + amount, loadout: { ...raid.adventurer, bagGrid: grid } };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/town.test.ts`
Expected: PASS（10 tests）

- [ ] **Step 5: Commit（承認がある場合のみ）**

```bash
git add src/core/town.ts tests/core/town.test.ts
git commit -m "feat(core): add town profile, shop, stash expansion and raid lifecycle"
```

---

### Task 11: セーブとロード

**Files:**
- Create: `src/core/save.ts`
- Test: `tests/core/save.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/core/save.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { placeItem } from '../../src/core/grid';
import { createItem } from '../../src/core/items';
import { createRng } from '../../src/core/rng';
import { type KeyValueStorage, SAVE_KEY, clearSave, loadProfile, saveProfile } from '../../src/core/save';
import { createProfile } from '../../src/core/town';

class MemoryStorage implements KeyValueStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

describe('save', () => {
  it('round-trips a profile', () => {
    const storage = new MemoryStorage();
    const base = createProfile(createRng(1));
    const profile = { ...base, gold: 123, stash: placeItem(base.stash, createItem('gem'), 2, 3, 0) };
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toEqual(profile);
  });

  it('returns null when nothing is saved', () => {
    expect(loadProfile(new MemoryStorage())).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    expect(loadProfile(storage)).toBeNull();
  });

  it('returns null for another version', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ version: 999, profile: createProfile(createRng(1)) }));
    expect(loadProfile(storage)).toBeNull();
  });

  it('returns null when an item id is unknown', () => {
    const storage = new MemoryStorage();
    const profile = createProfile(createRng(1));
    profile.shop[0] = { ...profile.shop[0], defId: 'removed_item' };
    saveProfile(storage, profile);
    expect(loadProfile(storage)).toBeNull();
  });

  it('clearSave removes the save', () => {
    const storage = new MemoryStorage();
    saveProfile(storage, createProfile(createRng(1)));
    clearSave(storage);
    expect(loadProfile(storage)).toBeNull();
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/core/save.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/core/save.ts`:
```ts
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
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/core/save.test.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: core 全体のテストと型チェックを通す**

Run: `npm test && npm run typecheck`
Expected: すべての test files が PASS し、型エラーがない。

- [ ] **Step 6: Commit（承認がある場合のみ）**

```bash
git add src/core/save.ts tests/core/save.test.ts
git commit -m "feat(core): add localStorage save and load"
```

---

### Task 12: UI 部品とスタイル

**Files:**
- Create: `src/ui/views.ts`
- Modify: `src/ui/style.css`（全体を置き換える）

UI は単体テストしない。型チェックと、Task 15 の手動確認で検証する。

- [ ] **Step 1: views.ts を書く**

`src/ui/views.ts`:
```ts
import { type Adventurer, EQUIP_SLOTS, type EquipSlotId, SLOT_LABELS, computeStats, consumableSlotCount } from '../core/equipment';
import { type Grid, type Placement, placementCells } from '../core/grid';
import { type ItemInstance, getDef } from '../core/items';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

export function hueOf(defId: string): number {
  let h = 0;
  for (const ch of defId) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function itemLabel(item: ItemInstance): string {
  const def = getDef(item.defId);
  return `${def.icon} ${def.name}${item.qty > 1 ? ` ×${item.qty}` : ''}`;
}

export function describeItem(item: ItemInstance): string {
  const d = getDef(item.defId);
  const lines = [d.name];
  if (d.weapon) lines.push(`攻撃 ${d.weapon.damage} / CT ${d.weapon.cooldown}秒 / スタミナ ${d.weapon.staminaCost}`);
  const m = d.mods;
  if (m?.maxHp) lines.push(`最大HP +${m.maxHp}`);
  if (m?.defense) lines.push(`防御 +${m.defense}`);
  if (m?.evasion) lines.push(`回避 +${Math.round(m.evasion * 100)}%`);
  if (m?.attackSpeed) lines.push(`攻撃速度 +${Math.round(m.attackSpeed * 100)}%`);
  if (m?.maxStamina) lines.push(`最大スタミナ +${m.maxStamina}`);
  if (d.periodicHeal) lines.push(`${d.periodicHeal.every}秒ごとにHP ${d.periodicHeal.heal}回復`);
  if (d.consumable) lines.push(`HP${Math.round(d.consumable.hpBelow * 100)}%未満でHP ${d.consumable.heal}回復`);
  if (d.consumableSlots) lines.push(`消費アイテム枠 ${d.consumableSlots}`);
  if (d.bagSize) lines.push(`バッグ ${d.bagSize.w}×${d.bagSize.h}`);
  if (item.durability !== null && d.maxDurability) lines.push(`耐久 ${item.durability}/${d.maxDurability}`);
  if (item.qty > 1) lines.push(`×${item.qty}`);
  lines.push(`売値 ${d.value * item.qty}G`);
  return lines.join('\n');
}

export function renderGrid(grid: Grid, container: 'stash' | 'bag', selectedUid: string | null): string {
  if (grid.w === 0 || grid.h === 0) return '<p class="muted">バッグを装備していません</p>';
  const owner = new Map<string, Placement>();
  const anchor = new Set<string>();
  for (const p of grid.placements) {
    placementCells(p).forEach(([x, y], i) => {
      owner.set(`${x},${y}`, p);
      if (i === 0) anchor.add(`${x},${y}`);
    });
  }
  let html = `<div class="grid" style="--cols:${grid.w}">`;
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      const key = `${x},${y}`;
      const p = owner.get(key);
      const classes = ['cell'];
      let style = '';
      let content = '';
      let title = '';
      if (p) {
        classes.push('filled');
        if (p.item.uid === selectedUid) classes.push('selected');
        style = ` style="--hue:${hueOf(p.item.defId)}"`;
        title = esc(describeItem(p.item));
        if (anchor.has(key)) content = `${getDef(p.item.defId).icon}${p.item.qty > 1 ? `<small>${p.item.qty}</small>` : ''}`;
      }
      html += `<div class="${classes.join(' ')}"${style} data-action="cell" data-container="${container}" data-x="${x}" data-y="${y}" title="${title}">${content}</div>`;
    }
  }
  return `${html}</div>`;
}

const LAYOUT: Readonly<Record<EquipSlotId, readonly [number, number]>> = {
  head: [3, 1], ring1: [2, 2], neck: [3, 2], ring2: [4, 2],
  rightHand: [1, 3], arms: [2, 3], body: [3, 3], hands: [4, 3], leftHand: [5, 3],
  belt: [3, 4], legs: [3, 5], feet: [3, 6],
};

function slotHtml(attrs: string, label: string, item: ItemInstance | null, selectedUid: string | null, style: string, disabled: boolean): string {
  const classes = ['slot'];
  if (item) classes.push('filled');
  if (item && item.uid === selectedUid) classes.push('selected');
  if (disabled) classes.push('disabled');
  const hue = item ? `--hue:${hueOf(item.defId)};` : '';
  const title = esc(item ? describeItem(item) : label);
  const icon = item ? getDef(item.defId).icon : '';
  return `<div class="${classes.join(' ')}" ${attrs} style="${style}${hue}" title="${title}"><span class="slot-label">${esc(label)}</span><span class="slot-icon">${icon}</span></div>`;
}

export function renderEquipment(adv: Adventurer, selectedUid: string | null): string {
  const slots = EQUIP_SLOTS.map((slot) => {
    const [col, row] = LAYOUT[slot];
    return slotHtml(`data-action="slot" data-slot="${slot}"`, SLOT_LABELS[slot], adv.equipment[slot] ?? null, selectedUid, `grid-column:${col};grid-row:${row};`, false);
  }).join('');
  const count = consumableSlotCount(adv.equipment);
  const consumables = adv.consumables
    .map((item, i) => slotHtml(`data-action="consumable" data-index="${i}"`, `消費${i + 1}`, item, selectedUid, '', i >= count))
    .join('');
  const bag = slotHtml('data-action="bag-slot"', 'バッグ', adv.bag, selectedUid, '', false);
  const s = computeStats(adv.equipment);
  return `<div class="paperdoll">${slots}</div>
    <div class="row-slots">${consumables}${bag}</div>
    <div class="stats">最大HP ${s.maxHp} / 防御 ${s.defense} / 回避 ${Math.round(s.evasion * 100)}% / 攻撃速度 ${Math.round(s.attackSpeed * 100)}% / スタミナ ${s.maxStamina}</div>`;
}
```

- [ ] **Step 2: style.css を置き換える**

`src/ui/style.css`:
```css
:root {
  color-scheme: dark;
  --bg: #14161a; --panel: #1e2128; --line: #333845; --text: #e6e6e6; --muted: #8a8f99;
  --accent: #e0b04a; --danger: #e0716a; --cell: 36px;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, 'Hiragino Sans', sans-serif; font-size: 14px; }
#app { max-width: 1200px; margin: 0 auto; padding: 16px 16px 80px; }
header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
h1 { font-size: 20px; margin: 8px 0; }
h2 { font-size: 15px; margin: 12px 0 6px; color: var(--accent); }
h3 { font-size: 13px; margin: 10px 0 4px; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px 12px; }
button { background: #2b303a; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; cursor: pointer; font: inherit; }
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); color: #1a1a1a; border-color: var(--accent); font-weight: bold; }
.muted { color: var(--muted); }

.grid { display: grid; grid-template-columns: repeat(var(--cols), var(--cell)); gap: 2px; }
.cell { width: var(--cell); height: var(--cell); background: #262a33; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 20px; cursor: pointer; position: relative; }
.cell small { position: absolute; right: 2px; bottom: 0; font-size: 10px; }
.cell.filled, .slot.filled { background: hsl(var(--hue) 35% 28%); }
.selected { outline: 2px solid var(--accent); outline-offset: -2px; }

.paperdoll { display: grid; grid-template-columns: repeat(5, 56px); grid-template-rows: repeat(6, 56px); gap: 4px; }
.slot { width: 56px; height: 56px; background: #262a33; border: 1px dashed var(--line); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; }
.slot.disabled { opacity: 0.35; }
.slot-label { font-size: 10px; color: var(--muted); }
.slot-icon { font-size: 22px; min-height: 26px; }
.row-slots { display: flex; gap: 4px; margin-top: 6px; }
.stats { margin-top: 6px; color: var(--muted); font-size: 12px; }

.map { display: grid; grid-template-columns: repeat(var(--n), auto); justify-content: start; }
.room { width: 52px; height: 52px; background: #262a33; border: 1px solid var(--line); border-radius: 6px; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 20px; overflow: hidden; }
.room small { font-size: 9px; color: var(--muted); line-height: 1.1; text-align: center; }
.room.visited { background: #2f3440; }
.room.current { border-color: var(--accent); border-width: 2px; }
.room.adjacent { cursor: pointer; border-color: #6fa0d8; }
.room.warn { box-shadow: inset 0 0 0 2px #8b5fbf; }
.room.closed { background: #3a2245; color: #b48ad6; }
.link.h { width: 10px; height: 4px; align-self: center; }
.link.v { width: 4px; height: 10px; justify-self: center; }
.link.on { background: #4a5060; }

.log { list-style: none; padding: 0; margin: 8px 0 0; font-size: 12px; color: var(--muted); max-height: 180px; overflow: auto; }
.floor, .shop { list-style: none; padding: 0; margin: 0; }
.floor li, .shop li { margin: 4px 0; }
.loot-item { cursor: pointer; padding: 2px 4px; border-radius: 4px; }
.drop-zone { margin-top: 8px; padding: 10px; border: 1px dashed var(--line); border-radius: 6px; text-align: center; color: var(--muted); cursor: pointer; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }

.selbar { position: fixed; left: 0; right: 0; bottom: 0; background: #101216ee; border-top: 1px solid var(--line); padding: 8px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.msg { color: var(--danger); margin-left: auto; }

.battle { display: flex; gap: 24px; align-items: center; justify-content: center; margin: 24px 0; }
.fighter { text-align: center; min-width: 140px; }
.big { font-size: 56px; }
.hpbar { height: 10px; background: #3a3f4b; border-radius: 5px; overflow: hidden; margin: 6px 0; }
.hpbar div { height: 100%; background: #5bbf6a; transition: width 0.2s; }
.vs { font-size: 20px; color: var(--muted); }
.battle-log { max-height: none; }
```

- [ ] **Step 3: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 4: Commit（承認がある場合のみ）**

```bash
git add src/ui/views.ts src/ui/style.css
git commit -m "feat(ui): add grid, paper doll and item description views"
```

---

### Task 13: 画面の描画

**Files:**
- Create: `src/ui/screens.ts`

- [ ] **Step 1: screens.ts を書く**

`src/ui/screens.ts`:
```ts
import {
  EXIT_OPEN_TURN, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  isClosed, isExitOpen, neighbors, roomHint, turnsUntilClosed,
} from '../core/dungeon';
import { computeStats } from '../core/equipment';
import { countGold } from '../core/grid';
import type { ItemInstance, Rotation } from '../core/items';
import { getMonster } from '../core/monsters';
import { ESCAPE_TURNS, type RaidState, SEARCH_TURNS, currentRoom } from '../core/raid';
import { type Profile, STASH_MAX_HEIGHT, buyPrice, stashExpandCost } from '../core/town';
import { describeItem, esc, itemLabel, renderEquipment, renderGrid } from './views';

export function renderSelectionBar(sel: { item: ItemInstance; rot: Rotation } | null, message: string): string {
  const info = sel
    ? `選択中: ${esc(itemLabel(sel.item))}（回転 ${sel.rot * 90}°）
       <button data-action="rotate">回転 (R)</button>
       <button data-action="discard">捨てる</button>
       <button data-action="deselect">選択解除 (Esc)</button>`
    : '<span class="muted">アイテムをクリックで選択 → 置き先をクリック</span>';
  return `<div class="selbar">${info}${message ? `<span class="msg">${esc(message)}</span>` : ''}</div>`;
}

export function renderTown(profile: Profile, selectedUid: string | null): string {
  const shop = profile.shop
    .map((item, i) => `<li title="${esc(describeItem(item))}">${esc(itemLabel(item))}
      <button data-action="buy" data-index="${i}">${buyPrice(item)}G で買う</button></li>`)
    .join('');
  const expand = profile.stash.h < STASH_MAX_HEIGHT
    ? `<button data-action="expand-stash">倉庫を拡張（${stashExpandCost(profile)}G）</button>`
    : '';
  return `<header><h1>拠点</h1><div>所持金 <b>${profile.gold}G</b> / 潜入回数 ${profile.raids}</div></header>
  <div class="cols">
    <section><h2>装備</h2>${renderEquipment(profile.loadout, selectedUid)}
      <h2>バッグ</h2>${renderGrid(profile.loadout.bagGrid, 'bag', selectedUid)}</section>
    <section><h2>倉庫 ${profile.stash.w}×${profile.stash.h}</h2>${renderGrid(profile.stash, 'stash', selectedUid)}
      <div class="actions">${expand}<button data-action="sell">選択中の倉庫アイテムを売る</button></div></section>
    <section><h2>商人</h2><ul class="shop">${shop || '<li class="muted">品切れ</li>'}</ul>
      <h2>潜入</h2>
      <p class="muted">空いている枠にはボロ装備が支給される。死亡すると装備とバッグの中身をすべて失う。潜入中にページを閉じた場合も失う。</p>
      <button class="primary" data-action="start-raid">ダンジョンへ潜入する</button>
      <p><button data-action="reset">データを初期化</button></p></section>
  </div>`;
}

function roomIcon(room: Room): string {
  switch (room.type) {
    case 'monster': return room.cleared ? '🦴' : getMonster(room.monsterId ?? '').icon;
    case 'chest': return room.cleared ? '📭' : '📦';
    case 'trap': return '⚠️';
    case 'spring': return room.cleared ? '🫗' : '⛲';
    case 'exit': return '🌀';
    case 'empty': return '';
  }
}

function roomTitle(room: Room): string {
  switch (room.type) {
    case 'monster': return room.cleared ? '戦いの跡' : 'モンスターの部屋';
    case 'chest': return room.cleared ? '空の宝箱' : '宝箱の部屋';
    case 'trap': return '罠の部屋';
    case 'spring': return '回復の泉';
    case 'exit': return '脱出口';
    case 'empty': return '空き部屋';
  }
}

function renderMap(raid: RaidState): string {
  const d = raid.dungeon;
  const n = d.size;
  const adjacent = new Set(raid.status === 'exploring' ? neighbors(d, raid.pos) : []);
  const linked = new Set(d.links.map(([a, b]) => `${a}-${b}`));
  const exitOpen = isExitOpen(raid.turn);
  let html = `<div class="map" style="--n:${n * 2 - 1}">`;
  for (let gy = 0; gy < n * 2 - 1; gy++) {
    for (let gx = 0; gx < n * 2 - 1; gx++) {
      if (gx % 2 === 0 && gy % 2 === 0) {
        const room = d.rooms[(gy / 2) * n + gx / 2];
        const classes = ['room'];
        if (room.visited) classes.push('visited');
        if (room.index === raid.pos) classes.push('current');
        if (adjacent.has(room.index)) classes.push('adjacent');
        if (isClosed(room, n, raid.turn)) classes.push('closed');
        else if ((turnsUntilClosed(room, n, raid.turn) ?? Infinity) <= MIASMA_WARNING) classes.push('warn');
        let icon = '?';
        if (room.index === raid.pos) icon = '🧙';
        else if (room.visited) icon = roomIcon(room);
        else if (room.type === 'exit' && exitOpen) icon = '🌀';
        const hint = adjacent.has(room.index) && !room.visited ? roomHint(room) : '';
        const attrs = adjacent.has(room.index) ? ` data-action="move" data-room="${room.index}"` : '';
        html += `<div class="${classes.join(' ')}"${attrs} title="${esc(hint)}">${icon}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
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

export function renderRaid(raid: RaidState, selectedUid: string | null): string {
  const stats = computeStats(raid.adventurer.equipment);
  const room = currentRoom(raid);
  const nextMiasma = MIASMA_SCHEDULE.find((s) => s.turn > raid.turn);
  const exitOpen = isExitOpen(raid.turn);
  const actions: string[] = [];
  if (room.type === 'chest' && !room.cleared) actions.push(`<button data-action="open-chest">宝箱を開ける（${SEARCH_TURNS}ターン）</button>`);
  if (room.type === 'spring' && !room.cleared) actions.push(`<button data-action="drink">泉の水を飲む（${SEARCH_TURNS}ターン）</button>`);
  if (room.type === 'exit') {
    actions.push(exitOpen
      ? `<button class="primary" data-action="escape">脱出する（${ESCAPE_TURNS}ターン）</button>`
      : `<span class="muted">脱出口は${EXIT_OPEN_TURN}ターン目に開く</span>`);
  }
  const floor = room.floor
    .map((item) => `<li><span class="loot-item${item.uid === selectedUid ? ' selected' : ''}" data-action="loot-item" data-uid="${item.uid}" title="${esc(describeItem(item))}">${esc(itemLabel(item))}</span>
      <button data-action="pickup" data-uid="${item.uid}">拾う</button></li>`)
    .join('');
  const messages = raid.messages.slice(-8).map((m) => `<li>${esc(m)}</li>`).join('');
  return `<header><h1>浅層</h1>
    <div>HP <b>${raid.adventurer.hp}/${stats.maxHp}</b> / ターン ${raid.turn}
      / ${nextMiasma ? `次の瘴気: ${nextMiasma.turn}ターン目` : '瘴気: 全域'}
      / 脱出口: ${exitOpen ? '開いている 🌀' : `${EXIT_OPEN_TURN}ターン目に開く`}</div></header>
  <div class="cols">
    <section><h2>マップ</h2>${renderMap(raid)}<ul class="log">${messages}</ul></section>
    <section><h2>${esc(roomTitle(room))}</h2><div class="actions">${actions.join('')}</div>
      <h3>床のアイテム</h3><ul class="floor">${floor || '<li class="muted">なし</li>'}</ul>
      <div class="drop-zone" data-action="loot-area">ここをクリックで選択中のアイテムを床に置く</div></section>
    <section><h2>装備</h2>${renderEquipment(raid.adventurer, selectedUid)}
      <h2>バッグ</h2>${renderGrid(raid.adventurer.bagGrid, 'bag', selectedUid)}</section>
  </div>`;
}

function fighterCard(icon: string, name: string, hp: number, maxHp: number): string {
  const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
  return `<div class="fighter"><div class="big">${icon}</div><div>${esc(name)}</div>
    <div class="hpbar"><div style="width:${pct}%"></div></div><div>${hp}/${maxHp}</div></div>`;
}

export function renderBattle(raid: RaidState, shown: number): string {
  const battle = raid.lastBattle;
  if (!battle) return '';
  const monster = getMonster(battle.monsterId);
  const r = battle.result;
  const hp: [number, number] = [r.startHp[0], r.startHp[1]];
  const names: [string, string] = ['あなた', monster.name];
  const lines: string[] = [];
  for (const e of r.events.slice(0, shown)) {
    const who = names[e.actor];
    switch (e.kind) {
      case 'hit':
        hp[e.actor === 0 ? 1 : 0] = e.targetHp;
        lines.push(`${e.t.toFixed(1)}s ${who}の攻撃！ ${e.damage}ダメージ`);
        break;
      case 'miss':
        lines.push(`${e.t.toFixed(1)}s ${who}の攻撃は外れた`);
        break;
      case 'heal':
        hp[e.actor] = e.hp;
        lines.push(`${e.t.toFixed(1)}s ${who}は${e.source}でHPが${e.amount}回復`);
        break;
      case 'fatigue':
        hp[e.actor] = e.hp;
        lines.push(`${e.t.toFixed(1)}s ${who}は疲労で${e.damage}ダメージ`);
        break;
    }
  }
  const done = shown >= r.events.length;
  const controls = done
    ? `<b>${r.winner === 0 ? '勝利！' : '敗北…'}</b> <button class="primary" data-action="battle-continue">続ける</button>`
    : '<button data-action="skip-battle">スキップ</button>';
  return `<header><h1>戦闘</h1></header>
  <div class="battle">${fighterCard('🧙', names[0], hp[0], r.maxHp[0])}<div class="vs">VS</div>${fighterCard(monster.icon, names[1], hp[1], r.maxHp[1])}</div>
  <div class="actions">${controls}</div>
  <ul class="log battle-log">${lines.slice(-12).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

export function renderResult(raid: RaidState): string {
  const escaped = raid.status === 'escaped';
  const items = raid.adventurer.bagGrid.placements
    .filter((p) => p.item.defId !== 'gold')
    .map((p) => `<li>${esc(itemLabel(p.item))}</li>`)
    .join('');
  const body = escaped
    ? `<p>金貨 ${countGold(raid.adventurer.bagGrid)}G と、次の持ち物を持ち帰った（装備も持ち帰る）。</p><ul>${items || '<li class="muted">なし</li>'}</ul>`
    : '<p>装備とバッグの中身をすべて失った。</p>';
  return `<header><h1>${escaped ? '脱出成功！' : '死亡…'}</h1></header>
  <section>${body}<ul class="log">${raid.messages.slice(-8).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
    <button class="primary" data-action="back-to-town">拠点に戻る</button></section>`;
}
```

- [ ] **Step 2: 型チェック**

Run: `npm run typecheck`
Expected: エラーなし

- [ ] **Step 3: Commit（承認がある場合のみ）**

```bash
git add src/ui/screens.ts
git commit -m "feat(ui): add town, raid, battle and result screens"
```

---

### Task 14: App（画面遷移と操作）と起動

**Files:**
- Create: `src/ui/app.ts`
- Modify: `src/main.ts`（全体を置き換える）

- [ ] **Step 1: app.ts を書く**

`src/ui/app.ts`:
```ts
import type { Adventurer, EquipSlotId } from '../core/equipment';
import { GameError } from '../core/errors';
import { findItemAt } from '../core/grid';
import type { Dest, Source } from '../core/inventory';
import type { ItemInstance, Rotation } from '../core/items';
import { type RaidState, currentRoom, drinkSpring, escape, moveRaidItem, moveTo, openChest, pickUp } from '../core/raid';
import type { Rng } from '../core/rng';
import { type KeyValueStorage, clearSave, saveProfile } from '../core/save';
import {
  type Profile, TownError, beginRaid, buy, createProfile, expandStash, finishRaid, moveTownItem, sellFromStash,
} from '../core/town';
import { renderBattle, renderRaid, renderResult, renderSelectionBar, renderTown } from './screens';

type Screen =
  | { kind: 'town' }
  | { kind: 'raid'; raid: RaidState }
  | { kind: 'battle'; raid: RaidState }
  | { kind: 'result'; raid: RaidState };

interface Selection {
  src: Source;
  item: ItemInstance;
  rot: Rotation;
}

/** 戦闘再生の速さ（シミュレーション1秒あたりのミリ秒） */
const BATTLE_MS_PER_SECOND = 400;

export class App {
  private readonly root: HTMLElement;
  private readonly storage: KeyValueStorage;
  private readonly rng: Rng;
  private profile: Profile;
  private screen: Screen = { kind: 'town' };
  private selection: Selection | null = null;
  private message = '';
  private battleShown = 0;
  private battleTimer: number | undefined;

  constructor(root: HTMLElement, profile: Profile, storage: KeyValueStorage, rng: Rng) {
    this.root = root;
    this.profile = profile;
    this.storage = storage;
    this.rng = rng;
    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.render();
  }

  private render(): void {
    const showBar = this.screen.kind === 'town' || this.screen.kind === 'raid';
    this.root.innerHTML = this.renderBody() + (showBar ? renderSelectionBar(this.selection, this.message) : '');
  }

  private renderBody(): string {
    const selectedUid = this.selection ? this.selection.item.uid : null;
    switch (this.screen.kind) {
      case 'town': return renderTown(this.profile, selectedUid);
      case 'raid': return renderRaid(this.screen.raid, selectedUid);
      case 'battle': return renderBattle(this.screen.raid, this.battleShown);
      case 'result': return renderResult(this.screen.raid);
    }
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'r' || e.key === 'R') {
      this.rotate();
      this.render();
    } else if (e.key === 'Escape') {
      this.selection = null;
      this.render();
    }
  }

  private onClick(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>('[data-action]');
    if (!el || !this.root.contains(el)) return;
    try {
      this.handle(el.dataset.action ?? '', el.dataset);
    } catch (err) {
      if (err instanceof GameError) this.message = err.message;
      else throw err;
    }
    this.render();
  }

  private handle(action: string, data: DOMStringMap): void {
    switch (action) {
      case 'cell':
        return this.clickCell(data.container === 'stash' ? 'stash' : 'bag', Number(data.x), Number(data.y));
      case 'slot': {
        const slot = data.slot as EquipSlotId;
        const item = this.adventurer().equipment[slot];
        return this.clickTarget({ kind: 'equip', slot }, item ? { src: { kind: 'equip', slot }, item, rot: 0 } : null);
      }
      case 'consumable': {
        const index = Number(data.index);
        const item = this.adventurer().consumables[index] ?? null;
        return this.clickTarget({ kind: 'consumable', index }, item ? { src: { kind: 'consumable', index }, item, rot: 0 } : null);
      }
      case 'bag-slot': {
        const item = this.adventurer().bag;
        return this.clickTarget({ kind: 'bagSlot' }, item ? { src: { kind: 'bagSlot' }, item, rot: 0 } : null);
      }
      case 'loot-item': {
        const uid = data.uid ?? '';
        const item = currentRoom(this.raid()).floor.find((i) => i.uid === uid);
        if (item) this.clickTarget({ kind: 'loot' }, { src: { kind: 'loot', uid }, item, rot: 0 });
        return;
      }
      case 'loot-area':
        return this.clickTarget({ kind: 'loot' }, null);
      case 'rotate':
        return this.rotate();
      case 'deselect':
        this.selection = null;
        return;
      case 'discard':
        if (this.selection && this.tryMove(this.selection.src, { kind: 'discard' })) this.selection = null;
        return;
      case 'pickup':
        this.selection = null;
        this.screen = { kind: 'raid', raid: pickUp(this.raid(), data.uid ?? '') };
        this.message = '';
        return;
      case 'sell':
        return this.sellSelected();
      case 'buy':
        this.profile = buy(this.profile, Number(data.index));
        return this.afterTownChange();
      case 'expand-stash':
        this.profile = expandStash(this.profile);
        return this.afterTownChange();
      case 'start-raid':
        return this.startRaid();
      case 'move':
        return this.afterRaidAction(moveTo(this.raid(), Number(data.room), this.rng));
      case 'open-chest':
        return this.afterRaidAction(openChest(this.raid(), this.rng));
      case 'drink':
        return this.afterRaidAction(drinkSpring(this.raid()));
      case 'escape':
        return this.afterRaidAction(escape(this.raid()));
      case 'skip-battle':
        return this.skipBattle();
      case 'battle-continue':
        return this.continueAfterBattle();
      case 'back-to-town':
        return this.backToTown();
      case 'reset':
        return this.resetSave();
      default:
        return;
    }
  }

  private adventurer(): Adventurer {
    return this.screen.kind === 'town' ? this.profile.loadout : this.screen.raid.adventurer;
  }

  private raid(): RaidState {
    if (this.screen.kind === 'town') throw new Error('not in a raid');
    return this.screen.raid;
  }

  private clickCell(container: 'stash' | 'bag', x: number, y: number): void {
    const grid = container === 'stash' ? this.profile.stash : this.adventurer().bagGrid;
    const p = findItemAt(grid, x, y);
    this.clickTarget(
      { kind: container, x, y, rot: 0 },
      p ? { src: { kind: container, uid: p.item.uid }, item: p.item, rot: p.rot } : null,
    );
  }

  /** dest: クリックした場所に置く場合の行き先。occupant: そこにあるアイテム（選択候補） */
  private clickTarget(dest: Dest, occupant: Selection | null): void {
    const sel = this.selection;
    if (!sel) {
      if (occupant) {
        this.selection = occupant;
        this.message = '';
      }
      return;
    }
    if (occupant && occupant.item.uid === sel.item.uid) {
      this.selection = null;
      return;
    }
    const finalDest: Dest = dest.kind === 'stash' || dest.kind === 'bag' ? { ...dest, rot: sel.rot } : dest;
    if (this.tryMove(sel.src, finalDest)) {
      this.selection = null;
      return;
    }
    if (occupant) {
      this.selection = occupant;
      this.message = '';
    }
  }

  private tryMove(src: Source, dest: Dest): boolean {
    try {
      if (this.screen.kind === 'town') {
        this.profile = moveTownItem(this.profile, src, dest);
        this.afterTownChange();
      } else if (this.screen.kind === 'raid') {
        this.screen = { kind: 'raid', raid: moveRaidItem(this.screen.raid, src, dest) };
      } else {
        return false;
      }
      this.message = '';
      return true;
    } catch (err) {
      if (err instanceof GameError) {
        this.message = err.message;
        return false;
      }
      throw err;
    }
  }

  private rotate(): void {
    if (this.selection) this.selection = { ...this.selection, rot: ((this.selection.rot + 1) % 4) as Rotation };
  }

  private afterTownChange(): void {
    saveProfile(this.storage, this.profile);
  }

  private sellSelected(): void {
    const src = this.selection?.src;
    if (!src || src.kind !== 'stash') throw new TownError('倉庫のアイテムを選択してください');
    this.profile = sellFromStash(this.profile, src.uid);
    this.selection = null;
    this.afterTownChange();
  }

  private startRaid(): void {
    const { profile, raid } = beginRaid(this.profile, this.rng);
    this.profile = profile;
    this.afterTownChange();
    this.selection = null;
    this.message = '';
    this.screen = { kind: 'raid', raid };
  }

  private afterRaidAction(raid: RaidState): void {
    this.selection = null;
    this.message = '';
    if (raid.lastBattle) {
      this.screen = { kind: 'battle', raid };
      this.battleShown = 0;
      this.scheduleBattle();
    } else if (raid.status !== 'exploring') {
      this.screen = { kind: 'result', raid };
    } else {
      this.screen = { kind: 'raid', raid };
    }
  }

  private scheduleBattle(): void {
    if (this.screen.kind !== 'battle' || !this.screen.raid.lastBattle) return;
    const events = this.screen.raid.lastBattle.result.events;
    if (this.battleShown >= events.length) return;
    const prevT = this.battleShown > 0 ? events[this.battleShown - 1].t : 0;
    const delay = Math.max(40, (events[this.battleShown].t - prevT) * BATTLE_MS_PER_SECOND);
    this.battleTimer = window.setTimeout(() => {
      this.battleShown += 1;
      this.render();
      this.scheduleBattle();
    }, delay);
  }

  private skipBattle(): void {
    window.clearTimeout(this.battleTimer);
    if (this.screen.kind === 'battle' && this.screen.raid.lastBattle) {
      this.battleShown = this.screen.raid.lastBattle.result.events.length;
    }
  }

  private continueAfterBattle(): void {
    window.clearTimeout(this.battleTimer);
    const raid = this.raid();
    this.screen = raid.status === 'exploring' ? { kind: 'raid', raid } : { kind: 'result', raid };
  }

  private backToTown(): void {
    this.profile = finishRaid(this.profile, this.raid(), this.rng);
    this.afterTownChange();
    this.screen = { kind: 'town' };
  }

  private resetSave(): void {
    if (!window.confirm('セーブデータを消去して最初からやり直しますか？')) return;
    clearSave(this.storage);
    this.profile = createProfile(this.rng);
    this.selection = null;
    this.message = '';
    this.screen = { kind: 'town' };
  }
}
```

- [ ] **Step 2: main.ts を置き換える**

`src/main.ts`:
```ts
import { createRng } from './core/rng';
import { loadProfile } from './core/save';
import { createProfile } from './core/town';
import { App } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');
const rng = createRng(Date.now() >>> 0);
const profile = loadProfile(window.localStorage) ?? createProfile(rng);
new App(root, profile, window.localStorage, rng);
```

- [ ] **Step 3: 型チェック、テスト、ビルド**

Run: `npm run typecheck && npm test && npm run build`
Expected: すべて成功する

- [ ] **Step 4: Commit（承認がある場合のみ）**

```bash
git add src/ui/app.ts src/main.ts
git commit -m "feat(ui): wire up app state, input handling and battle playback"
```

---

### Task 15: 手動プレイ確認

**Files:** なし（不具合が見つかったら、該当ファイルを修正し、core の不具合なら先にテストを追加する）

- [ ] **Step 1: 開発サーバーを起動する**

Run: `npm run dev`
Expected: `http://localhost:5173/` が表示される

- [ ] **Step 2: 次のシナリオを順に確認する**

1. 初回起動時に拠点画面が表示され、所持金 0G、倉庫 8×6、商人に 6 品が並んでいる。
2. 「ダンジョンへ潜入する」を押すと、ボロ装備（錆びた短剣、ボロ布の服、布袋、黒パン）を身につけた状態で潜入画面に移る。
3. マップで、隣の部屋（青い枠）にだけ移動できる。未訪問の隣接部屋には気配の文字が出る。
4. モンスターの部屋に入ると戦闘画面になり、HP バーとログが進む。「スキップ」で最後まで飛ばせる。「続ける」で潜入画面に戻る。
5. 勝利後、床にドロップ品が出る。「拾う」でバッグに入る。バッグのアイテムをクリックして選択し、R で回転し、別のマスをクリックして移動できる。
6. 床から短剣などを選択し、空いている左手枠をクリックすると装備できる。埋まっている枠では「その枠は使用中です」と表示される。
7. 宝箱を開けるとターンが 1 進み、床に中身が出る。
8. 12 ターン目に脱出口が開き、マップに 🌀 が表示される。脱出口の部屋で「脱出する」を押すと結果画面になる。
9. 「拠点に戻る」と、持ち帰った金貨が所持金に加算され、装備とバッグの中身が拠点の手持ちに残っている。
10. バッグのアイテムを倉庫に移し、売却や購入、倉庫の拡張ができる。
11. ページをリロードしても拠点の状態が復元される。
12. 30 ターン目以降に外周の部屋にいると、瘴気でダメージを受ける。死亡すると結果画面に「死亡…」と表示され、拠点に戻ると手持ちが空になっている。

- [ ] **Step 3: 問題があれば修正して再確認する**

core の不具合は、再現するテストを `tests/core/` に追加してから修正する。UI の不具合は直接修正し、Step 2 の該当シナリオを再確認する。

- [ ] **Step 4: Commit（承認がある場合のみ）**

```bash
git add -A
git commit -m "fix: issues found in manual playtest"
```

---

## 仕様書との対応（MVP 範囲）

| 仕様書の項目 | タスク |
|---|---|
| ゲームループ（準備 → 潜入 → 脱出 → 拠点） | 9, 10, 14 |
| ボロ装備の支給 | 10 |
| 装備枠 12 ＋ 消費アイテム枠（ベルト依存） | 4, 5 |
| 人型レイアウト | 12 |
| バッグ（形のあるアイテム、回転、金貨スタック、バッグの種類） | 2, 3, 5 |
| クールタイム制オートバトル、疲労、耐久度 | 4, 7, 9 |
| 部屋マップ、気配、時間圧、瘴気、脱出口 | 8, 9, 13 |
| 倉庫（グリッド、拡張）、商人（売買、品揃え更新） | 6, 10 |
| 保存 | 11, 14 |

MVP 対象外（仕様書の後続フェーズ）：AI ライバル、鍛冶屋（強化・修理・合成）、レアリティ、深層、両手武器と盾。
