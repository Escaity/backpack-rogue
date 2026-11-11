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
    const label = `${def.icon} ${def.name}`;
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
