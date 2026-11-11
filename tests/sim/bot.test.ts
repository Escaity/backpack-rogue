import { describe, expect, it } from 'vitest';
import { startRaid } from '../../src/core/raid';
import { createRng } from '../../src/core/rng';
import { withFreeKit } from '../../src/core/town';
import { clearRate, playRaid } from './bot';
import { fullLoadout, starterLoadout } from './loadouts';

describe('reference bot', () => {
  it('always finishes a raid (escaped or dead)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const end = playRaid(startRaid(withFreeKit(starterLoadout()), rng), 1, rng);
      expect(end.status).not.toBe('exploring');
    }
  });

  it('only escapes from the target floor', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed);
      const end = playRaid(startRaid(withFreeKit(fullLoadout()), rng), 2, rng);
      if (end.status === 'escaped') expect(end.floor).toBe(2);
    }
  });

  it('a well-equipped bot clears floor 1 most of the time', () => {
    expect(clearRate(fullLoadout, 1, 30)).toBeGreaterThan(0.5);
  }, 60_000);
});
