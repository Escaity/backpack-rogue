import { describe, expect, it } from 'vitest';
import { FLOOR_SCALING, getMonster, monstersForFloor, scaledMonster } from '../../src/core/monsters';

describe('monsters by floor', () => {
  it('adds stronger monsters to deeper floors', () => {
    expect(monstersForFloor(1)).toEqual(['rat', 'goblin', 'skeleton']);
    expect(monstersForFloor(2)).toEqual(['rat', 'goblin', 'skeleton', 'ghoul']);
    expect(monstersForFloor(3)).toEqual(['rat', 'goblin', 'skeleton', 'ghoul', 'troll']);
    expect(() => monstersForFloor(4)).toThrow();
  });

  it('defines the troll', () => {
    expect(getMonster('troll')).toMatchObject({ name: 'トロル', icon: '🧌', maxHp: 50, defense: 2 });
  });

  it('floor 1 keeps the base stats', () => {
    const ghoul = getMonster('ghoul');
    expect(scaledMonster(ghoul, 1)).toEqual(ghoul);
  });

  it('scales HP, damage and gold with depth', () => {
    const base = getMonster('ghoul');
    for (const floor of [2, 3]) {
      const s = scaledMonster(base, floor);
      const scale = FLOOR_SCALING[floor - 1];
      expect(s.maxHp).toBe(Math.ceil(base.maxHp * scale.hp));
      expect(s.weapon.dice.bonus).toBe(base.weapon.dice.bonus + scale.damage);
      expect(s.weapon.dice.count).toBe(base.weapon.dice.count);
      expect(s.gold).toEqual([base.gold[0] * floor, base.gold[1] * floor]);
    }
    expect(base.maxHp).toBe(getMonster('ghoul').maxHp);
  });
});
