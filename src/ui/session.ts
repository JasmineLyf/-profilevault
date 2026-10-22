import type { Envelope, Payload } from '../core/schema';
export class Session {
  key?: CryptoKey;
  payload?: Payload;
  envelope?: Envelope;
  deadline = 0;
  generation = 0;
  deviceMode = false;
  unlock(key: CryptoKey, payload: Payload, envelope: Envelope, deviceMode = false) {
    this.key = key;
    this.payload = payload;
    this.envelope = envelope;
    this.deviceMode = deviceMode;
    this.generation++;
    this.touch();
  }
  touch() {
    this.deadline = Date.now() + (this.payload?.preferences.autoLockMinutes ?? 5) * 60000;
  }
  check(generation = this.generation) {
    if (
      generation !== this.generation ||
      !this.key ||
      !this.payload ||
      !this.envelope ||
      (!this.deviceMode && Date.now() >= this.deadline)
    )
      throw Error('LOCKED');
    return { key: this.key, payload: this.payload, envelope: this.envelope };
  }
  lock() {
    this.generation++;
    this.key = undefined;
    this.payload = undefined;
    this.envelope = undefined;
    this.deadline = 0;
  }
}
