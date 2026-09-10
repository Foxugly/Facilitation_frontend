import { describe, expect, it } from 'vitest';
import { secondsLeft } from './countdown';

describe('secondsLeft', () => {
  const now = new Date('2026-07-18T12:00:00Z');

  it('renvoie null sans echeance', () => {
    expect(secondsLeft(null, now)).toBeNull();
  });

  it('arrondit vers le haut le temps restant', () => {
    expect(secondsLeft('2026-07-18T12:00:29.400Z', now)).toBe(30);
  });

  it('ne descend jamais sous zero', () => {
    expect(secondsLeft('2026-07-18T11:59:00Z', now)).toBe(0);
  });
});
