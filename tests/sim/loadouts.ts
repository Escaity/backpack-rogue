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
