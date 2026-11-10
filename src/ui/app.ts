import type { Adventurer, EquipSlotId } from '../core/equipment';
import { GameError } from '../core/errors';
import { type Placement, findItemAt } from '../core/grid';
import type { Dest, Source } from '../core/inventory';
import type { ItemInstance, Rotation } from '../core/items';
import { type RaidState, currentRoom, drinkSpring, escape, moveRaidItem, moveTo, openChest, pickUp } from '../core/raid';
import type { Rng } from '../core/rng';
import { type KeyValueStorage, clearSave, saveProfile } from '../core/save';
import {
  type Profile, TownError, beginRaid, buy, createProfile, expandStash, finishRaid, moveTownItem, sellFromStash,
} from '../core/town';
import { renderBattle, renderBattleProgress, renderRaid, renderResult, renderSelectionBar, renderTown } from './screens';

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
  /** 現在の潜入の結果を確定（finishRaid）済みか。潜入開始時にリセットする */
  private raidSettled = false;

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
        // pickUp が失敗（バッグ満杯など）したら例外で抜けるので、選択はそのまま残る
        this.screen = { kind: 'raid', raid: pickUp(this.raid(), data.uid ?? '') };
        this.selection = null;
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
      p,
    );
  }

  /**
   * dest: クリックした場所に置く場合の行き先。occupant: そこにあるアイテム（選択候補）。
   * placement: グリッドのクリック位置にある配置（原点と向きの比較用）
   */
  private clickTarget(dest: Dest, occupant: Selection | null, placement?: Placement): void {
    const sel = this.selection;
    if (!sel) {
      if (occupant) {
        this.selection = occupant;
        this.message = '';
      }
      return;
    }
    if (occupant && occupant.item.uid === sel.item.uid) {
      // 自分自身のマスをクリック: グリッド上で向きか位置が変わるなら移動を試みる。変化なし・失敗なら選択解除
      if ((dest.kind === 'stash' || dest.kind === 'bag') && placement) {
        const changed = sel.rot !== placement.rot || dest.x !== placement.x || dest.y !== placement.y;
        if (changed) this.tryMove(sel.src, { ...dest, rot: sel.rot });
      }
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
    this.raidSettled = false;
    this.screen = { kind: 'raid', raid };
  }

  private afterRaidAction(raid: RaidState): void {
    this.selection = null;
    this.message = '';
    if (raid.status !== 'exploring') this.settleRaid(raid);
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

  /** 潜入の終了時にただちに結果を確定して保存する（結果画面でリロードしても失われない）。1回の潜入につき1度だけ */
  private settleRaid(raid: RaidState): void {
    if (this.raidSettled) return;
    this.raidSettled = true;
    this.profile = finishRaid(this.profile, raid, this.rng);
    this.afterTownChange();
  }

  private scheduleBattle(): void {
    if (this.screen.kind !== 'battle' || !this.screen.raid.lastBattle) return;
    const events = this.screen.raid.lastBattle.result.events;
    if (this.battleShown >= events.length) return;
    const prevT = this.battleShown > 0 ? events[this.battleShown - 1].t : 0;
    const delay = Math.max(40, (events[this.battleShown].t - prevT) * BATTLE_MS_PER_SECOND);
    this.battleTimer = window.setTimeout(() => {
      this.battleShown += 1;
      if (this.screen.kind === 'battle' && this.battleShown >= (this.screen.raid.lastBattle?.result.events.length ?? 0)) {
        this.render(); // 再生完了: コントロールを「続ける」に切り替える
        return;
      }
      this.updateBattleProgress();
      this.scheduleBattle();
    }, delay);
  }

  /** 再生中は進行表示だけを差し替える（ボタンを作り直さないのでクリックを取りこぼさない） */
  private updateBattleProgress(): void {
    if (this.screen.kind !== 'battle') return;
    const el = this.root.querySelector('#battle-progress');
    if (el) el.innerHTML = renderBattleProgress(this.screen.raid, this.battleShown);
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
