import { it, expect, vi } from 'vitest';
import { Session } from '../../src/ui/session';
import { fixture } from '../fixtures/profile';
import { createVault } from '../../src/core/crypto';
it('checks the actual lock deadline independently of timer callbacks and invalidates old async work', async () => {
  const { key, envelope } = await createVault(fixture, 'a long test passphrase');
  const s = new Session();
  s.unlock(key, structuredClone(fixture), envelope);
  const generation = s.generation;
  vi.spyOn(Date, 'now').mockReturnValue(s.deadline + 1);
  expect(() => s.check()).toThrow('LOCKED');
  vi.restoreAllMocks();
  s.lock();
  expect(s.key).toBeUndefined();
  expect(s.payload).toBeUndefined();
  expect(() => s.check(generation)).toThrow('LOCKED');
});
