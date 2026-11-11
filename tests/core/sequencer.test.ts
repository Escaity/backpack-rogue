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
    expect(seq[0]).toMatchObject({ cols: [2], top: 0, cooldown: 2, charges: null, label: '🔪 投げナイフ' });
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
