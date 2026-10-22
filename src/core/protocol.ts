import { z } from 'zod';
import { fieldIds } from './field-catalog';
import { resumeSchema } from './schema';
const uuid = z.string().uuid();
export const valueSchema = z.union([
  z.string().max(4000),
  z.boolean(),
  z.array(z.string().max(512)).max(100),
  resumeSchema,
]);
export const planSchema = z
  .object({
    protocolVersion: z.literal(1),
    operationId: uuid,
    scanId: uuid,
    documentToken: uuid,
    expectedOrigin: z.string().url().max(256),
    expiresAt: z.number().int().positive(),
    fields: z
      .array(
        z
          .object({
            fieldId: uuid,
            semanticFingerprint: z.string().max(20000),
            sourceFieldId: z.enum(fieldIds).optional(),
            value: valueSchema,
            overwriteApproved: z.boolean(),
            sensitiveApproved: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine((p) => new Set(p.fields.map((f) => f.fieldId)).size === p.fields.length)
  .refine(
    (p) =>
      p.fields.reduce(
        (sum, f) =>
          sum + (typeof f.value === 'object' && !Array.isArray(f.value) ? f.value.size : 0),
        0,
      ) <=
      4 * 1024 * 1024,
  );
export const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SCAN') }).strict(),
  z.object({ type: z.literal('FILL'), plan: planSchema }).strict(),
  z.object({ type: z.literal('UNDO'), documentToken: uuid }).strict(),
  z.object({ type: z.literal('CLEAR') }).strict(),
]);
export type FillPlan = z.infer<typeof planSchema>;
export type Value = z.infer<typeof valueSchema>;
export interface Features {
  fieldId: string;
  semanticFingerprint: string;
  section: string;
  label: string;
  labelledby: string;
  ariaLabel: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  type: string;
  context: string;
  hasValue: boolean;
  blocked?: string;
  maxLength: number;
  pattern: string;
  options?: { value: string; text: string; disabled: boolean }[];
}
export interface ScanResult {
  scanId: string;
  documentToken: string;
  origin: string;
  title: string;
  fields: Features[];
  warnings: string[];
}
export interface FieldResult {
  fieldId: string;
  status:
    | 'written'
    | 'skipped'
    | 'failed'
    | 'reverted'
    | 'changed'
    | 'restored'
    | 'edited'
    | 'expired';
  reason: string;
}
export function trustedUI(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('ui/index.html');
}
export function supportedURL(url: string) {
  try {
    const u = new URL(url);
    return (
      ['http:', 'https:'].includes(u.protocol) &&
      !['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com'].includes(
        u.hostname,
      ) &&
      !u.pathname.toLowerCase().endsWith('.pdf')
    );
  } catch {
    return false;
  }
}
