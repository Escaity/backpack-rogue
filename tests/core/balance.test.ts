import { describe, expect, it } from 'vitest';
import { clearRate } from '../sim/bot';
import { basicLoadout, fullLoadout, starterLoadout } from '../sim/loadouts';

describe('clear rates with the reference bot (300 raids each)', () => {
  it('地下1階：初期装備で 40〜60%', () => {
    const rate = clearRate(starterLoadout, 1);
    expect(rate, `rate=${rate}`).toBeGreaterThanOrEqual(0.4);
    expect(rate, `rate=${rate}`).toBeLessThanOrEqual(0.6);
  }, 120_000);

  it('地下2階：最低限の武器と防具で 30〜50%', () => {
    const rate = clearRate(basicLoadout, 2);
    expect(rate, `rate=${rate}`).toBeGreaterThanOrEqual(0.3);
    expect(rate, `rate=${rate}`).toBeLessThanOrEqual(0.5);
  }, 120_000);

  it('地下3階：フル装備＋バッグの戦闘道具で 20〜40%', () => {
    const rate = clearRate(fullLoadout, 3);
    expect(rate, `rate=${rate}`).toBeGreaterThanOrEqual(0.2);
    expect(rate, `rate=${rate}`).toBeLessThanOrEqual(0.4);
  }, 120_000);
});
