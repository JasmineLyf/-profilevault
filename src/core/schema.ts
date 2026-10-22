import { z } from 'zod';
import { countryAliases } from './field-catalog';
const text = z.string().min(1).max(256);
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + 'T00:00:00Z');
    return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v;
  });
export const phoneSchema = z
  .object({
    countryCallingCode: z.string().regex(/^\+[1-9]\d{0,3}$/),
    nationalNumber: z.string().regex(/^\d{1,30}$/),
    extension: z
      .string()
      .regex(/^\d{1,10}$/)
      .optional(),
  })
  .strict();
export const legacyProfileSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().min(1).max(80),
    person: z
      .object({
        fullName: text.optional(),
        familyName: text.optional(),
        givenName: text.optional(),
        latinFullName: text.optional(),
        birthDate: calendarDate.optional(),
      })
      .strict(),
    contact: z.object({ email: text.email().optional(), phone: phoneSchema.optional() }).strict(),
    address: z
      .object({
        countryCode: z
          .string()
          .refine((v) => v in countryAliases && Object.hasOwn(countryAliases, v))
          .optional(),
        region: text.optional(),
        city: text.optional(),
        district: text.optional(),
        line1: z.string().min(1).max(512).optional(),
        line2: z.string().min(1).max(512).optional(),
        postalCode: text.optional(),
      })
      .strict(),
    organization: z.object({ name: text.optional(), jobTitle: text.optional() }).strict(),
    links: z
      .object({
        website: text
          .url()
          .refine((v) => ['https:', 'http:'].includes(new URL(v).protocol))
          .optional(),
      })
      .strict(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const localizedSchema = z.object({ zh: text.optional(), en: text.optional() }).strict();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const degrees = [
  'highSchool',
  'associate',
  'bachelor',
  'master',
  'doctor',
  'other',
] as const;
export const educationSchema = z
  .object({
    id: z.string().uuid(),
    school: localizedSchema,
    degree: z.enum(degrees),
    major: localizedSchema.optional(),
    startMonth: month.optional(),
    endMonth: month.optional(),
    description: z
      .object({ zh: z.string().max(4000).optional(), en: z.string().max(4000).optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine((e) => !!(e.school.zh || e.school.en), '请填写学校')
  .refine(
    (e) => !e.startMonth || !e.endMonth || e.startMonth <= e.endMonth,
    '结束时间不能早于开始时间',
  );
export const experienceSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['internship', 'work', 'project']),
    company: localizedSchema,
    title: localizedSchema,
    description: z
      .object({ zh: z.string().max(4000).optional(), en: z.string().max(4000).optional() })
      .strict()
      .optional(),
    startMonth: month.optional(),
    endMonth: month.optional(),
    current: z.boolean(),
  })
  .strict()
  .refine((e) => !!(e.company.zh || e.company.en), '请填写单位或项目')
  .refine(
    (e) => !e.startMonth || !e.endMonth || e.startMonth <= e.endMonth,
    '结束时间不能早于开始时间',
  )
  .refine((e) => !e.current || !e.endMonth, '至今经历不能有结束时间');
export const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 9 * 1024 * 1024;
export const MAX_RESUME_BYTES = 2 * 1024 * 1024;
export function validBase64(v: string) {
  try {
    return v.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(v) && btoa(atob(v)) === v;
  } catch {
    return false;
  }
}
export const resumeSchema = z
  .object({
    id: z.string().uuid(),
    language: z.enum(['zh', 'en']),
    name: z
      .string()
      .min(1)
      .max(180)
      .regex(/^[^/\\]+\.(pdf|docx)$/i),
    mime: z.enum([
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]),
    size: z.number().int().min(1).max(MAX_RESUME_BYTES),
    dataB64: z
      .string()
      .max(Math.ceil(MAX_RESUME_BYTES / 3) * 4)
      .refine(validBase64),
  })
  .strict()
  .refine((r) => {
    if (!validBase64(r.dataB64)) return false;
    const b = atob(r.dataB64);
    return (
      b.length === r.size &&
      (r.mime === 'application/pdf'
        ? r.name.toLowerCase().endsWith('.pdf') && b.startsWith('%PDF-')
        : r.name.toLowerCase().endsWith('.docx') && b.startsWith('PK'))
    );
  }, '简历文件格式不合法');
export const profileSchema = legacyProfileSchema
  .extend({
    translations: z
      .object({
        en: legacyProfileSchema
          .pick({ person: true, address: true, organization: true })
          .partial()
          .optional(),
      })
      .strict()
      .optional(),
    education: z.array(educationSchema).max(10).optional(),
    highestEducationId: z.string().uuid().optional(),
    currentEducationId: z.string().uuid().optional(),
    experiences: z.array(experienceSchema).max(20).optional(),
    resumes: z.array(resumeSchema).max(2).optional(),
  })
  .superRefine((p, ctx) => {
    for (const list of [p.education ?? [], p.experiences ?? [], p.resumes ?? []])
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({ code: 'custom', message: 'DUPLICATE_ID' });
    for (const id of [p.highestEducationId, p.currentEducationId])
      if (id && !p.education?.some((x) => x.id === id))
        ctx.addIssue({ code: 'custom', message: 'EDUCATION_REFERENCE' });
    if (new Set(p.resumes?.map((r) => r.language)).size !== (p.resumes?.length ?? 0))
      ctx.addIssue({ code: 'custom', message: 'RESUME_LANGUAGE' });
  });
const payloadObject = z
  .object({
    schemaVersion: z.literal(2),
    vaultId: z.string().uuid(),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    profiles: z.array(profileSchema).max(20),
    preferences: z
      .object({
        defaultProfileId: z.string().uuid().optional(),
        autoLockMinutes: z.union([z.literal(1), z.literal(5), z.literal(15)]),
      })
      .strict(),
  })
  .strict();
export const payloadSchema = payloadObject.superRefine((p, ctx) => {
  if (new Set(p.profiles.map((x) => x.id)).size !== p.profiles.length)
    ctx.addIssue({ code: 'custom', message: 'DUPLICATE_ID' });
  if (
    p.preferences.defaultProfileId &&
    !p.profiles.some((x) => x.id === p.preferences.defaultProfileId)
  )
    ctx.addIssue({ code: 'custom', message: 'DEFAULT_PROFILE' });
});
export const legacyPayloadSchema = payloadObject
  .extend({ schemaVersion: z.literal(1), profiles: z.array(legacyProfileSchema).max(20) })
  .superRefine((p, ctx) => {
    if (
      new Set(p.profiles.map((x) => x.id)).size !== p.profiles.length ||
      (p.preferences.defaultProfileId &&
        !p.profiles.some((x) => x.id === p.preferences.defaultProfileId))
    )
      ctx.addIssue({ code: 'custom', message: 'LEGACY_REFERENCE' });
  });
export function decodePayload(value: unknown, version: 1 | 2) {
  return payloadSchema.parse(
    version === 1 ? { ...legacyPayloadSchema.parse(value), schemaVersion: 2 } : value,
  );
}
const base64 = z
  .string()
  .max(Math.ceil((MAX_PAYLOAD_BYTES + 16) / 3) * 4)
  .refine(validBase64);
export const envelopeSchema = z
  .object({
    format: z.literal('profilevault'),
    formatVersion: z.union([z.literal(1), z.literal(2)]),
    vaultId: z.string().uuid(),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    kdf: z
      .object({
        name: z.literal('PBKDF2'),
        hash: z.literal('SHA-256'),
        iterations: z.number().int().min(100000).max(2000000),
        saltB64: z
          .string()
          .max(24)
          .refine(validBase64)
          .refine((v) => validBase64(v) && atob(v).length === 16),
      })
      .strict(),
    cipher: z
      .object({
        name: z.literal('AES-GCM'),
        ivB64: z
          .string()
          .max(16)
          .refine(validBase64)
          .refine((v) => validBase64(v) && atob(v).length === 12),
        tagLength: z.literal(128),
      })
      .strict(),
    ciphertextB64: base64.refine(
      (v) => validBase64(v) && atob(v).length >= 16 && atob(v).length <= MAX_PAYLOAD_BYTES + 16,
    ),
  })
  .strict();
export type Profile = z.infer<typeof profileSchema>;
export type Payload = z.infer<typeof payloadSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export function parseEnvelope(raw: string) {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw Error('FILE_SIZE');
  return envelopeSchema.parse(JSON.parse(raw));
}
export function emptyProfile(label = '新资料档案'): Profile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    label,
    person: {},
    contact: {},
    address: {},
    organization: {},
    links: {},
    createdAt: now,
    updatedAt: now,
  };
}
export function emptyPayload(): Payload {
  return {
    schemaVersion: 2,
    vaultId: crypto.randomUUID(),
    revision: 0,
    profiles: [],
    preferences: { autoLockMinutes: 5 },
  };
}
