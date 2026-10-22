import {
  envelopeSchema,
  payloadSchema,
  decodePayload,
  MAX_PAYLOAD_BYTES,
  type Envelope,
  type Payload,
} from './schema';
const encoder = new TextEncoder();
export function toB64(data: Uint8Array) {
  let s = '';
  for (let i = 0; i < data.length; i += 8192)
    s += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(s);
}
export function fromB64(v: string) {
  return Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
}
export function aad(e: Envelope) {
  return encoder.encode(
    JSON.stringify([
      'profilevault',
      e.formatVersion,
      e.vaultId,
      e.revision,
      'PBKDF2',
      'SHA-256',
      e.kdf.iterations,
      e.kdf.saltB64,
      'AES-GCM',
      e.cipher.ivB64,
      128,
    ]),
  );
}
export async function derive(passphrase: string, kdf: Envelope['kdf']) {
  envelopeSchema.shape.kdf.parse(kdf);
  const bytes = encoder.encode(passphrase);
  try {
    const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(kdf.saltB64), iterations: kdf.iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  } finally {
    bytes.fill(0);
  }
}
export async function encrypt(
  payload: Payload,
  key: CryptoKey,
  kdf: Envelope['kdf'],
): Promise<Envelope> {
  const p = payloadSchema.parse(payload);
  const data = encoder.encode(JSON.stringify(p));
  if (data.length > MAX_PAYLOAD_BYTES) throw Error('PAYLOAD_SIZE');
  const e: Envelope = {
    format: 'profilevault',
    formatVersion: 2,
    vaultId: p.vaultId,
    revision: p.revision,
    kdf,
    cipher: {
      name: 'AES-GCM',
      ivB64: toB64(crypto.getRandomValues(new Uint8Array(12))),
      tagLength: 128,
    },
    ciphertextB64: '',
  };
  try {
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: fromB64(e.cipher.ivB64), additionalData: aad(e), tagLength: 128 },
      key,
      data,
    );
    e.ciphertextB64 = toB64(new Uint8Array(ciphertext));
    return envelopeSchema.parse(e);
  } finally {
    data.fill(0);
  }
}
export async function decrypt(envelope: Envelope, passphrase: string) {
  const e = envelopeSchema.parse(envelope);
  const key = await derive(passphrase, e.kdf);
  let clear: ArrayBuffer;
  try {
    clear = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(e.cipher.ivB64), additionalData: aad(e), tagLength: 128 },
      key,
      fromB64(e.ciphertextB64),
    );
  } catch {
    throw Error('AUTH_FAILED');
  }
  try {
    if (clear.byteLength > (e.formatVersion === 1 ? 1048576 : MAX_PAYLOAD_BYTES))
      throw Error('PAYLOAD_SIZE');
    const payload = decodePayload(
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clear)),
      e.formatVersion,
    );
    if (payload.vaultId !== e.vaultId || payload.revision !== e.revision)
      throw Error('METADATA_MISMATCH');
    return { key, payload };
  } finally {
    new Uint8Array(clear).fill(0);
  }
}
export async function createVault(payload: Payload, passphrase: string) {
  if (passphrase.length < 12) throw Error('PASSPHRASE_LENGTH');
  const kdf: Envelope['kdf'] = {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 600000,
    saltB64: toB64(crypto.getRandomValues(new Uint8Array(16))),
  };
  const key = await derive(passphrase, kdf);
  return { key, envelope: await encrypt(payload, key, kdf) };
}
