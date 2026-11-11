import { describe, expect, it } from 'vitest';
import { type Room, EXIT_OPEN_TURN, neighbors } from '../../src/core/dungeon';
import { type Adventurer, createAdventurer } from '../../src/core/equipment';
import { countGold, createGrid, placeItem } from '../../src/core/grid';
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

  it('picks up part of a gold pile when the bag is nearly full', () => {
    const { state } = setup();
    const filler = structuredClone(state);
    filler.adventurer.bagGrid = createGrid(1, 1);
    const gold = createItem('gold', 80);
    const next = pickUp(withRoom(filler, filler.pos, { floor: [gold] }), gold.uid);
    expect(countGold(next.adventurer.bagGrid)).toBe(50);
    expect(currentRoom(next).floor.map((i) => i.qty)).toEqual([30]);
  });

  it('fails to pick up gold when nothing fits', () => {
    const { state } = setup();
    const full = structuredClone(state);
    full.adventurer.bagGrid = createGrid(1, 1);
    const gold = createItem('gold', 80);
    const once = pickUp(withRoom(full, full.pos, { floor: [gold, createItem('gold', 10)] }), gold.uid);
    const rest = currentRoom(once).floor[0];
    expect(() => pickUp(once, rest.uid)).toThrow('バッグに空きがありません');
  });

  it('clamps HP to the new max HP when armor breaks in a fight', () => {
    const { state, rng } = setup();
    const target = neighbors(state.dungeon, state.pos)[0];
    const s = structuredClone(withRoom(state, target, { type: 'monster', monsterId: 'rat', cleared: false }));
    const mail = createItem('chain_mail');
    mail.durability = 1;
    s.adventurer.equipment = { rightHand: createItem('short_sword'), body: mail };
    s.adventurer.hp = 60;
    const next = moveTo(s, target, rng);
    expect(next.status).toBe('exploring');
    expect(next.adventurer.equipment.body).toBeUndefined();
    expect(next.adventurer.hp).toBeLessThanOrEqual(50);
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
