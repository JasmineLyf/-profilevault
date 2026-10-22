import { it, expect } from 'vitest';
import { createVault, decrypt, derive, aad, toB64 } from '../../src/core/crypto';
import {
  decodePayload,
  profileSchema,
  resumeSchema,
  emptyProfile,
  MAX_RESUME_BYTES,
} from '../../src/core/schema';
import { profileValue, uniqueOption } from '../../src/core/normalize';
import { educationFromLine, suggestFromText } from '../../src/core/resume-parser';
import { fixture } from '../fixtures/profile';
import { Session } from '../../src/ui/session';
it('decodes a real authenticated v1 envelope without losing profiles and upgrades only on encryption', async () => {
  const legacy = { ...structuredClone(fixture), schemaVersion: 1 };
  const payload = decodePayload(legacy, 1);
  expect(payload.schemaVersion).toBe(2);
  expect(payload.profiles).toEqual(legacy.profiles);
  const kdf = {
    name: 'PBKDF2' as const,
    hash: 'SHA-256' as const,
    iterations: 100000,
    saltB64: toB64(crypto.getRandomValues(new Uint8Array(16))),
  };
  const key = await derive('legacy long passphrase', kdf);
  const envelope = {
    format: 'profilevault' as const,
    formatVersion: 1 as const,
    vaultId: legacy.vaultId,
    revision: legacy.revision,
    kdf,
    cipher: {
      name: 'AES-GCM' as const,
      ivB64: toB64(crypto.getRandomValues(new Uint8Array(12))),
      tagLength: 128 as const,
    },
    ciphertextB64: '',
  };
  envelope.ciphertextB64 = toB64(
    new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: Uint8Array.from(atob(envelope.cipher.ivB64), (c) => c.charCodeAt(0)),
          additionalData: aad(envelope),
        },
        key,
        new TextEncoder().encode(JSON.stringify(legacy)),
      ),
    ),
  );
  expect((await decrypt(envelope, 'legacy long passphrase')).payload).toEqual(payload);
  expect((await createVault(payload, 'new long passphrase')).envelope.formatVersion).toBe(2);
});
it('validates education references, ordered dates and language-isolated values', () => {
  const p = emptyProfile();
  const id = crypto.randomUUID();
  p.education = [
    { id, school: { zh: '示例大学', en: 'Fictional University' }, degree: 'bachelor' },
  ];
  p.highestEducationId = id;
  p.currentEducationId = id;
  p.person.fullName = '乔云';
  p.translations = { en: { person: { fullName: 'Yun Qiao' } } };
  expect(profileSchema.safeParse(p).success).toBe(true);
  expect(profileValue(p, 'person.fullName', undefined, { language: 'en' })).toBe('Yun Qiao');
  expect(profileValue(p, 'education.school', undefined, { language: 'en', educationId: id })).toBe(
    'Fictional University',
  );
  expect(profileValue(p, 'education.school', undefined, { language: 'en' })).toBeUndefined();
  expect(profileSchema.safeParse({ ...p, highestEducationId: crypto.randomUUID() }).success).toBe(
    false,
  );
  expect(
    profileSchema.safeParse({
      ...p,
      education: [{ ...p.education[0], startMonth: '2025-09', endMonth: '2024-06' }],
    }).success,
  ).toBe(false);
  expect(
    uniqueOption(
      [{ value: 'ms', text: "Master's Degree", disabled: false }],
      '硕士',
      'education.degree',
    ),
  ).toBe('ms');
});
it('limits resume formats and sizes and only suggests text fields for explicit review', () => {
  const data = new TextEncoder().encode('%PDF-1.4\n');
  expect(
    resumeSchema.safeParse({
      id: crypto.randomUUID(),
      language: 'en',
      name: 'cv.pdf',
      mime: 'application/pdf',
      size: data.length,
      dataB64: toB64(data),
    }).success,
  ).toBe(true);
  expect(
    resumeSchema.safeParse({
      id: crypto.randomUUID(),
      language: 'en',
      name: 'cv.pdf',
      mime: 'application/pdf',
      size: MAX_RESUME_BYTES + 1,
      dataB64: '!!!!',
    }).success,
  ).toBe(false);
  const suggestions = suggestFromText(
    'Yun Qiao\nqiao.yun@example.test\nFictional University Bachelor of Science\nInternship - Fictional Labs',
  );
  expect(suggestions.some((x) => x.kind === 'email')).toBe(true);
  expect(suggestions.some((x) => x.kind === 'education')).toBe(true);
  expect(educationFromLine('示例大学 本科 2020.09-2024.06', 'zh').degree).toBe('bachelor');
});
it('device mode avoids repeated password prompts while retaining session-generation invalidation', async () => {
  const created = await createVault(fixture, 'random device secret');
  const s = new Session();
  s.unlock(created.key, fixture, created.envelope, true);
  s.deadline = 0;
  expect(s.check().payload).toEqual(fixture);
  s.lock();
  expect(() => s.check()).toThrow('LOCKED');
});

it('matches PhD labels without confusing medical or law doctorates', () => {
  const options = [
    { value: 'md', text: 'Doctor of Medicine (M.D.)', disabled: false },
    { value: 'phd', text: 'Doctor of Philosophy (Ph.D.)', disabled: false },
    { value: 'jd', text: 'Juris Doctor (J.D.)', disabled: false },
  ];
  for (const value of ['博士', 'PhD', 'Ph.D.', 'Doctor of Philosophy'])
    expect(uniqueOption(options, value, 'education.degree')).toBe('phd');
  expect(
    uniqueOption(
      options.filter((o) => o.value !== 'phd'),
      '博士',
      'education.degree',
    ),
  ).toBeUndefined();
});

it('matches bilingual country and city dropdowns and rejects ambiguous options', () => {
  expect(
    uniqueOption([{ value: 'cn', text: 'China', disabled: false }], 'CN', 'address.countryCode'),
  ).toBe('cn');
  expect(
    uniqueOption([{ value: 'bj', text: 'Beijing', disabled: false }], '北京市', 'address.city'),
  ).toBe('bj');
  expect(
    uniqueOption([{ value: 'bj', text: '北京市', disabled: false }], 'Beijing', 'address.city'),
  ).toBe('bj');
  expect(
    uniqueOption(
      [
        { value: 'a', text: 'Beijing', disabled: false },
        { value: 'b', text: '北京市', disabled: false },
      ],
      '北京',
      'address.city',
    ),
  ).toBeUndefined();
});
