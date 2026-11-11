import { diceRange, formatDice } from '../core/dice';
import { type Adventurer, EQUIP_SLOTS, type EquipSlotId, SLOT_LABELS, computeStats, consumableSlotCount } from '../core/equipment';
import { type Grid, type Placement, placementCells } from '../core/grid';
import { type ItemInstance, getDef } from '../core/items';
import { toolEffectText } from '../core/sequencer';

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
  if (d.weapon) lines.push(`攻撃 ${formatDice(d.weapon.dice)}（${diceRange(d.weapon.dice).join("〜")}） / CT ${d.weapon.cooldown}秒 / スタミナ ${d.weapon.staminaCost}`);
  const m = d.mods;
  if (m?.maxHp) lines.push(`最大HP +${m.maxHp}`);
  if (m?.defense) lines.push(`防御 +${m.defense}`);
  if (m?.evasion) lines.push(`回避 +${Math.round(m.evasion * 100)}%`);
  if (m?.attackSpeed) lines.push(`攻撃速度 +${Math.round(m.attackSpeed * 100)}%`);
  if (m?.maxStamina) lines.push(`最大スタミナ +${m.maxStamina}`);
  if (d.periodicHeal) lines.push(`${d.periodicHeal.every}秒ごとにHP ${d.periodicHeal.heal}回復`);
  if (d.consumable) lines.push(`HP${Math.round(d.consumable.hpBelow * 100)}%未満でHP ${d.consumable.heal}回復`);
  if (d.tool) lines.push(d.tool.cooldown === 0 ? `戦闘道具：${toolEffectText(d.tool.effect)}` : `戦闘道具 CT ${d.tool.cooldown}秒：${toolEffectText(d.tool.effect)}`);
  if (d.tool?.maxCharges) lines.push(`残り ${item.charges ?? d.tool.maxCharges}/${d.tool.maxCharges}`);
  if (d.consumable) lines.push('バッグに置くと、カーソルが来たときHPが回復量以上減っていれば使う');
  if (d.consumableSlots) lines.push(`消費アイテム枠 ${d.consumableSlots}`);
  if (d.bagSize) lines.push(`バッグ ${d.bagSize.w}×${d.bagSize.h}`);
  if (item.durability !== null && d.maxDurability) lines.push(`耐久 ${item.durability}/${d.maxDurability}`);
  if (item.qty > 1) lines.push(`×${item.qty}`);
  lines.push(`売値 ${d.value * item.qty}G`);
  return lines.join('\n');
}

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
export function renderBattleBag(grid: Grid, cursorCol: number, flashing: ReadonlySet<string>, spent: ReadonlySet<string> = new Set()): string {
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
        if (spent.has(p.item.uid)) classes.push('spent');
        style = ` style="--hue:${hueOf(p.item.defId)}"`;
        tip = ` data-tip="${esc(describeItem(p.item))}"`;
        if (anchor.has(key)) content = cellContent(p);
      }
      html += `<div class="${classes.join(' ')}"${style}${tip}>${content}</div>`;
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
  const tip = item ? ` data-tip="${esc(describeItem(item))}"` : "";
  const icon = item ? getDef(item.defId).icon : '';
  return `<div class="${classes.join(' ')}" ${attrs} style="${style}${hue}"${tip}><span class="slot-label">${esc(label)}</span><span class="slot-icon">${icon}</span></div>`;
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
