import { describe, it, expect } from 'vitest';
import { createVault, decrypt, encrypt } from '../../src/core/crypto';
import { payloadSchema, parseEnvelope, envelopeSchema } from '../../src/core/schema';
import { VaultRepository } from '../../src/core/vault-repository';
import { fixture } from '../fixtures/profile';
describe('encrypted vault', () => {
  it('roundtrips with non-exportable key, fresh IV and no known plaintext', async () => {
    const t = performance.now(),
      { key, envelope } = await createVault(fixture, 'a long test passphrase');
    console.info('KDF + encrypt ms:', Math.round(performance.now() - t));
    expect(key.extractable).toBe(false);
    expect((await decrypt(envelope, 'a long test passphrase')).payload).toEqual(fixture);
    const another = await encrypt(fixture, key, envelope.kdf);
    expect(another.cipher.ivB64).not.toBe(envelope.cipher.ivB64);
    for (const needle of ['乔云', 'qiao.yun', '2025550147', '虚构测试资料'])
      expect(JSON.stringify(envelope)).not.toContain(needle);
  });
  it('rejects wrong password, ciphertext and authenticated metadata tampering', async () => {
    const { envelope } = await createVault(fixture, 'a long test passphrase');
    await expect(decrypt(envelope, 'wrong password')).rejects.toThrow('AUTH_FAILED');
    for (const changed of [
      { ...envelope, revision: 4 },
      { ...envelope, cipher: { ...envelope.cipher, ivB64: btoa('abcdefghijkl') } },
      {
        ...envelope,
        ciphertextB64:
          (envelope.ciphertextB64[0] === 'A' ? 'B' : 'A') + envelope.ciphertextB64.slice(1),
      },
    ])
      await expect(decrypt(changed, 'a long test passphrase')).rejects.toThrow('AUTH_FAILED');
    expect(
      envelopeSchema.safeParse({ ...envelope, kdf: { ...envelope.kdf, iterations: 2000001 } })
        .success,
    ).toBe(false);
    expect(() => parseEnvelope(' '.repeat(9 * 1024 * 1024 + 1))).toThrow('FILE_SIZE');
  });
  it('preserves stored vault on conflict, storage failure and failed password change', async () => {
    const { key, envelope } = await createVault(fixture, 'a long test passphrase');
    let stored = structuredClone(envelope),
      fail = false;
    const repo = new VaultRepository({
      get: async () => stored,
      set: async (e) => {
        if (fail) throw Error('STORAGE_FAILURE');
        stored = e;
      },
    });
    await expect(
      repo.changePassphrase(envelope, 'wrong', 'a new test passphrase'),
    ).rejects.toThrow();
    expect(stored).toEqual(envelope);
    fail = true;
    await expect(repo.save(fixture, key, envelope)).rejects.toThrow('STORAGE_FAILURE');
    expect(stored).toEqual(envelope);
    fail = false;
    const next = await repo.save(fixture, key, envelope);
    expect(next.payload.revision).toBe(2);
    await expect(repo.save(fixture, key, envelope)).rejects.toThrow('REVISION_CONFLICT');
    const changed = await repo.changePassphrase(
      stored,
      'a long test passphrase',
      'a new test passphrase',
    );
    expect((await decrypt(changed.envelope, 'a new test passphrase')).payload.profiles).toEqual(
      fixture.profiles,
    );
  });
  it('rejects unknown keys, duplicate ids, broken references, dates, URL and numeric phone', () => {
    expect(payloadSchema.safeParse({ ...fixture, secret: 'bad' }).success).toBe(false);
    expect(
      payloadSchema.safeParse({ ...fixture, profiles: [fixture.profiles[0], fixture.profiles[0]] })
        .success,
    ).toBe(false);
    for (const patch of [
      { person: { birthDate: '2025-02-29' } },
      { links: { website: 'javascript:alert(1)' } },
      { contact: { phone: { nationalNumber: 123, countryCallingCode: '+86' } } },
      { address: { countryCode: 'XX' } },
    ])
      expect(
        payloadSchema.safeParse({ ...fixture, profiles: [{ ...fixture.profiles[0], ...patch }] })
          .success,
      ).toBe(false);
  });
});
