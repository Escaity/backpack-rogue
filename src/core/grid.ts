import { type Cell, GOLD_ID, type ItemInstance, type Rotation, getDef, newUid, rotateShape } from './items';

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

/**
 * 空いている場所に自動で入れる。スタック可能なら既存のスタックに先に足す。
 * 入る分だけ入れ、入りきらなかった分を leftover として返す（全部入れば null）
 */
export function storePartial(grid: Grid, item: ItemInstance): { grid: Grid; leftover: ItemInstance | null } {
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
  let usedOriginalUid = false;
  while (remaining > 0) {
    const qty = stackMax ? Math.min(stackMax, remaining) : remaining;
    const piece: ItemInstance = usedOriginalUid ? { ...item, uid: newUid(), qty } : { ...item, qty };
    const spot = findFreeSpot(next, piece);
    if (!spot) break;
    usedOriginalUid = true;
    next = placeItem(next, piece, spot.x, spot.y, spot.rot);
    remaining -= qty;
  }
  if (remaining <= 0) return { grid: next, leftover: null };
  const leftover: ItemInstance = { ...item, uid: usedOriginalUid ? newUid() : item.uid, qty: remaining };
  return { grid: next, leftover };
}

/** 全部入れば新しいグリッド、入りきらなければ null（all-or-nothing） */
export function storeItem(grid: Grid, item: ItemInstance): Grid | null {
  const r = storePartial(grid, item);
  return r.leftover ? null : r.grid;
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
