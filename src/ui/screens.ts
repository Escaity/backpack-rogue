import {
  EXIT_OPEN_TURN, MIASMA_SCHEDULE, MIASMA_WARNING, type Room,
  isClosed, isExitOpen, neighbors, roomHint, turnsUntilClosed,
} from '../core/dungeon';
import { computeStats } from '../core/equipment';
import { countGold } from '../core/grid';
import type { Source } from '../core/inventory';
import { type ItemInstance, type Rotation, getDef } from '../core/items';
import { getMonster } from '../core/monsters';
import { ESCAPE_TURNS, type RaidState, SEARCH_TURNS, currentRoom } from '../core/raid';
import { type Profile, STASH_MAX_HEIGHT, buyPrice, stashExpandCost } from '../core/town';
import { describeItem, esc, itemLabel, renderBattleBag, renderEquipment, renderGrid } from './views';

function isEquippable(item: ItemInstance): boolean {
  const kind = getDef(item.defId).kind;
  return kind === 'equipment' || kind === 'consumable' || kind === 'bag';
}

export function renderSelectionBar(sel: { src: Source; item: ItemInstance; rot: Rotation } | null, message: string): string {
  const canEquip = sel !== null && (sel.src.kind === 'bag' || sel.src.kind === 'stash' || sel.src.kind === 'loot') && isEquippable(sel.item);
  const info = sel
    ? `選択中: ${esc(itemLabel(sel.item))}（回転 ${sel.rot * 90}°）
       ${canEquip ? '<button class="primary" data-action="equip">装備する</button>' : ''}
       <button data-action="rotate">回転 (R)</button>
       <button data-action="discard">捨てる</button>
       <button data-action="deselect">選択解除 (Esc)</button>`
    : '<span class="muted">アイテムをクリックで選択 → 置き先をクリック</span>';
  return `<div class="selbar">${info}${message ? `<span class="msg">${esc(message)}</span>` : ''}</div>`;
}

export function renderTown(profile: Profile, selectedUid: string | null): string {
  const shop = profile.shop
    .map((item, i) => `<li data-tip="${esc(describeItem(item))}">${esc(itemLabel(item))}
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
        html += `<div class="${classes.join(' ')}"${attrs}${hint ? ` data-tip="${esc(hint)}"` : ""}>${icon}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
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
    .map((item) => `<li><span class="loot-item${item.uid === selectedUid ? ' selected' : ''}" data-action="loot-item" data-uid="${item.uid}" data-tip="${esc(describeItem(item))}">${esc(itemLabel(item))}</span>
      <button data-action="pickup" data-uid="${item.uid}">拾う</button>
      ${isEquippable(item) ? `<button data-action="equip-loot" data-uid="${item.uid}">装備</button>` : ''}</li>`)
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

/** 発動した道具が点灯し続けるゲーム内時間（秒） */
const TOOL_FLASH_SECONDS = 0.6;

/** 戦闘の進行表示（HPカードとログ）。再生中はここだけを更新する */
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
  const useTotal = new Map<string, number>();
  const useSeen = new Map<string, number>();
  const isUse = (e: (typeof r.events)[number]): e is (typeof r.events)[number] & { uid: string } =>
    e.actor === 0 && (e.kind === 'toolHit' || e.kind === 'toolMiss' || e.kind === 'buff' || e.kind === 'heal') && 'uid' in e && !!e.uid;
  for (const e of r.events) if (isUse(e)) useTotal.set(e.uid, (useTotal.get(e.uid) ?? 0) + 1);
  for (const e of visible) if (isUse(e)) useSeen.set(e.uid, (useSeen.get(e.uid) ?? 0) + 1);
  const spent = new Set(r.spentItems.filter((uid) => (useTotal.get(uid) ?? 0) > 0 && useSeen.get(uid) === useTotal.get(uid)));
  let cursorCol = -1;
  const lines: string[] = [];
  const blockedText = (blocked: number): string => (blocked > 0 ? `（🧣${blocked}軽減）` : '');
  for (const e of visible) {
    const who = names[e.actor];
    const ts = `${e.t.toFixed(1)}s`;
    if (e.actor === 0 && 'uid' in e && e.uid && e.t >= latestT - TOOL_FLASH_SECONDS) flashing.add(e.uid);
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
  <div class="battle-bag-wrap"><h3>バッグ（カーソル ${cursorCol >= 0 ? `列${cursorCol + 1}` : '待機中'}）</h3>${renderBattleBag(battle.bag, cursorCol, flashing, spent)}</div>
  <ul class="log battle-log">${lines.slice(-12).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
}

export function renderBattle(raid: RaidState, shown: number): string {
  const battle = raid.lastBattle;
  if (!battle) return '';
  const r = battle.result;
  const done = shown >= r.events.length;
  const controls = done
    ? `<b>${r.winner === 0 ? '勝利！' : '敗北…'}</b> <button class="primary" data-action="battle-continue">続ける</button>`
    : '<button data-action="skip-battle">スキップ</button>';
  return `<header><h1>戦闘</h1></header>
  <div id="battle-progress">${renderBattleProgress(raid, shown)}</div>
  <div id="battle-controls" class="actions">${controls}</div>`;
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
