import { createVault, decrypt, encrypt } from './crypto';
import { envelopeSchema, payloadSchema, type Envelope, type Payload } from './schema';
export interface StorageAdapter {
  get(): Promise<unknown>;
  set(e: Envelope, deviceSecret?: string | null): Promise<void>;
}
export const chromeStorage: StorageAdapter = {
  async get() {
    return (await chrome.storage.local.get('vault')).vault;
  },
  async set(vault, deviceSecret) {
    await chrome.storage.local.set({
      vault,
      ...(deviceSecret !== undefined ? { deviceSecret } : {}),
    });
  },
};
export class VaultRepository {
  constructor(private storage: StorageAdapter) {}
  async read() {
    const e = await this.storage.get();
    return e ? envelopeSchema.parse(e) : undefined;
  }
  async replace(next: Envelope, expected?: Envelope, deviceSecret?: string | null) {
    const current = await this.read();
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error('REVISION_CONFLICT');
    await this.storage.set(envelopeSchema.parse(next), deviceSecret);
  }
  async save(payload: Payload, key: CryptoKey, expected: Envelope) {
    const next = payloadSchema.parse({ ...payload, revision: expected.revision + 1 });
    const envelope = await encrypt(next, key, expected.kdf);
    await this.replace(envelope, expected);
    return { payload: next, envelope };
  }
  async changePassphrase(expected: Envelope, currentPass: string, newPass: string) {
    const { payload } = await decrypt(expected, currentPass);
    const next = await createVault({ ...payload, revision: expected.revision + 1 }, newPass);
    await decrypt(next.envelope, newPass);
    await this.replace(next.envelope, expected);
    return { ...next, payload: { ...payload, revision: expected.revision + 1 } };
  }
}
