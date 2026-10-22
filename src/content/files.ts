import { resumeSchema } from '../core/schema';
import { fromB64 } from '../core/crypto';
import type { Value } from '../core/protocol';
export function isResumeValue(value: Value) {
  return typeof value === 'object' && !Array.isArray(value);
}
export function fileCompatible(el: HTMLInputElement, value: Value) {
  const parsed = resumeSchema.safeParse(value);
  if (el.type !== 'file' || el.disabled || !parsed.success) return false;
  const file = parsed.data,
    accepted = el.accept
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  return (
    !accepted.length ||
    accepted.some(
      (a) =>
        a === file.mime ||
        a === 'application/*' ||
        a === '.' + file.name.toLowerCase().split('.').at(-1),
    )
  );
}
export function attachResume(el: HTMLInputElement, value: Value) {
  if (!fileCompatible(el, value)) throw Error('FILE_INCOMPATIBLE');
  const resume = resumeSchema.parse(value);
  const transfer = new DataTransfer();
  transfer.items.add(new File([fromB64(resume.dataB64)], resume.name, { type: resume.mime }));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files')!.set!.call(
    el,
    transfer.files,
  );
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (
    el.files?.length !== 1 ||
    el.files[0].name !== resume.name ||
    el.files[0].size !== resume.size
  )
    throw Error('FILE_REVERTED');
}
