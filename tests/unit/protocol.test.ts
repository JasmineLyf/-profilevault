import { describe, it, expect } from 'vitest';
import { messageSchema, supportedURL } from '../../src/core/protocol';
describe('M0 boundaries', () => {
  it('only explicit messages with no unknown keys', () => {
    expect(messageSchema.safeParse({ type: 'SCAN' }).success).toBe(true);
    expect(messageSchema.safeParse({ type: 'SCAN', script: 'bad' }).success).toBe(false);
    expect(messageSchema.safeParse({ type: 'FILL', plan: {} }).success).toBe(false);
  });
  it('rejects restricted targets', () => {
    for (const url of [
      'file:///a',
      'chrome://settings',
      'edge://settings',
      'https://chromewebstore.google.com/a',
      'https://example.test/a.pdf',
    ])
      expect(supportedURL(url)).toBe(false);
    expect(supportedURL('https://example.test')).toBe(true);
  });
});
