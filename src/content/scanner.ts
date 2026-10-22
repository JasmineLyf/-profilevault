import type { Features, ScanResult, Value } from '../core/protocol';
import { blockedReason } from '../core/policies';
import { autocomplete } from '../core/matcher';
import { isCombobox, comboboxValue, comboboxSurface } from './combobox';
export type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export function state(el: Control): Value {
  if (isCombobox(el)) return comboboxValue(el);
  if (el instanceof HTMLInputElement && el.type === 'file')
    return JSON.stringify(Array.from(el.files ?? [], (f) => [f.name, f.size, f.lastModified]));
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) return el.checked;
  if (el instanceof HTMLSelectElement && el.multiple)
    return Array.from(el.selectedOptions, (o) => o.value);
  return el.value;
}
export function same(a: Value, b: Value) {
  return JSON.stringify(a) === JSON.stringify(b);
}
export function visible(el: Control) {
  if (
    !el.isConnected ||
    el.disabled ||
    ('readOnly' in el && el.readOnly && !isCombobox(el)) ||
    el.closest('[hidden],[inert],[aria-hidden="true"]')
  )
    return false;
  const surface = comboboxSurface(el);
  if (surface !== el && getComputedStyle(el).display === 'none') return false;
  for (let p: Element | null = surface; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (
      s.display === 'none' ||
      s.visibility === 'hidden' ||
      s.visibility === 'collapse' ||
      s.opacity === '0'
    )
      return false;
  }
  return Array.from(surface.getClientRects()).some((r) => r.width > 0 && r.height > 0);
}
const limited = (v: string | null | undefined) => v?.slice(0, 256) ?? '';
export function radioGroup(el: Control): Control[] {
  if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return [el];
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    (x) => x.name === el.name && x.form === el.form && x.getRootNode() === el.getRootNode(),
  );
}
export interface RecordEntry {
  el: Control;
  features: Features;
  before: Value;
  group: { el: Control; before: Value }[];
  files?: File[];
}
export class Scanner {
  documentToken = crypto.randomUUID();
  scanId = '';
  records = new Map<string, RecordEntry>();
  stale = false;
  private scannedURL = '';
  isCurrentDocument() {
    return this.scannedURL === location.href;
  }
  private observer: MutationObserver;
  constructor() {
    this.observer = new MutationObserver(() => {
      this.stale = true;
    });
    this.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }
  features(el: Control, fieldId: string, checkGroup = true): Features {
    const forms = Array.from(document.forms);
    const form = el.form ?? el.closest('form');
    const fieldset = el.closest('fieldset');
    const legend = limited(fieldset?.querySelector('legend')?.textContent);
    const ac = el.autocomplete ?? '';
    const acInfo = autocomplete(ac);
    const context = [
      legend,
      limited(form?.getAttribute('aria-label')),
      limited(form?.querySelector('h1,h2,h3')?.textContent),
    ]
      .filter(Boolean)
      .join(' · ');
    const section = [
      form ? '表单 ' + (forms.indexOf(form) + 1) : '主文档',
      legend,
      ac.split(/\s+/).find((t) => t.startsWith('section-')),
      acInfo.section,
    ]
      .filter(Boolean)
      .join(' · ');
    const options =
      el instanceof HTMLSelectElement
        ? Array.from(el.options)
            .slice(0, 500)
            .map((o) => ({
              value: limited(o.value),
              text: limited(o.text),
              disabled:
                o.disabled ||
                (o.parentElement instanceof HTMLOptGroupElement && o.parentElement.disabled),
            }))
        : undefined;
    const f: Features = {
      fieldId,
      semanticFingerprint: '',
      section,
      label: limited(Array.from(el.labels ?? [], (l) => l.textContent ?? '').join(' ')),
      labelledby: limited(
        (el.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .slice(0, 10)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' '),
      ),
      ariaLabel: limited(el.getAttribute('aria-label')),
      name: limited(el.name),
      id: limited(el.id),
      placeholder: limited(el.getAttribute('placeholder')),
      autocomplete: limited(ac),
      type: isCombobox(el)
        ? 'combobox'
        : el instanceof HTMLInputElement
          ? el.type
          : el instanceof HTMLSelectElement
            ? el.multiple
              ? 'select-multiple'
              : 'select-one'
            : 'textarea',
      context,
      hasValue: false,
      maxLength: 'maxLength' in el ? el.maxLength : -1,
      pattern: limited(el.getAttribute('pattern')),
      options,
    };
    f.blocked = blockedReason(f);
    if (!visible(el)) f.blocked = '隐藏、不可用或只读控件';
    if (
      ![
        'text',
        'combobox',
        'file',
        'month',
        'email',
        'tel',
        'url',
        'search',
        'date',
        'number',
        'radio',
        'checkbox',
        'textarea',
        'select-one',
        'select-multiple',
      ].includes(f.type)
    )
      f.blocked = '不支持的控件类型';
    if (el instanceof HTMLSelectElement && el.options.length > 500)
      f.blocked = '选项超过 500 项限制';
    let groupFeatures: Features[] | undefined;
    if (checkGroup && el instanceof HTMLInputElement && el.type === 'radio' && !f.blocked) {
      const group = radioGroup(el);
      if (group.length > 100) f.blocked = '单选组超过 100 项限制';
      else {
        groupFeatures = group.map((member) => this.features(member, '', false));
        if (groupFeatures.some((member) => member.blocked))
          f.blocked = '单选组包含禁止或不可用控件';
      }
    }
    if (f.blocked) {
      f.options = undefined;
      return f;
    }
    f.hasValue = isCombobox(el)
      ? Boolean(comboboxValue(el))
      : el instanceof HTMLInputElement && el.type === 'file'
        ? Boolean(el.files?.length)
        : el instanceof HTMLInputElement && el.type === 'radio'
          ? radioGroup(el).some((member) => member instanceof HTMLInputElement && member.checked)
          : el instanceof HTMLSelectElement && el.multiple
            ? el.selectedOptions.length > 0
            : el instanceof HTMLInputElement && el.type === 'checkbox'
              ? el.checked
              : (el.value ?? '').length > 0;
    // The fingerprint is local session metadata, never contains the current input value.
    f.semanticFingerprint = JSON.stringify([
      f.section,
      f.label,
      f.labelledby,
      f.ariaLabel,
      f.name,
      f.id,
      f.placeholder,
      f.autocomplete,
      f.type,
      f.context,
      f.maxLength,
      f.pattern,
      f.options,
      el instanceof HTMLInputElement && ['radio', 'checkbox'].includes(el.type) ? el.value : '',
      el.required,
      el.getAttribute('accept'),
      el.getAttribute('multiple'),
      el.getAttribute('role'),
      groupFeatures?.map((member) => member.semanticFingerprint),
    ]);
    return f;
  }
  scan(): ScanResult {
    this.scannedURL = location.href;
    this.records.clear();
    this.scanId = crypto.randomUUID();
    this.stale = false;
    const elements = Array.from(
      document.querySelectorAll<Control>('input,textarea,select,[role="combobox"]'),
    ).filter(
      (el) =>
        !el.closest('[role="listbox"]') &&
        !(el.getAttribute('role') !== 'combobox' && el.closest('[role="combobox"]')),
    );
    const fields = Array.from(elements)
      .slice(0, 500)
      .map((el) => {
        const fieldId = crypto.randomUUID(),
          features = this.features(el, fieldId);
        if (!features.blocked)
          this.records.set(fieldId, {
            el,
            features,
            before: state(el),
            group: radioGroup(el).map((el) => ({ el, before: state(el) })),
            ...(el instanceof HTMLInputElement && el.type === 'file'
              ? { files: Array.from(el.files ?? []) }
              : {}),
          });
        return features;
      });
    const warnings = [
      '仅扫描主文档；支持原生控件及有可访问语义的下拉框。iframe、shadow DOM 和无语义自绘控件仍不支持。',
    ];
    if (elements.length > 500) warnings.push('候选控件超过 500 项，仅扫描前 500 项，请缩小范围。');
    return {
      scanId: this.scanId,
      documentToken: this.documentToken,
      origin: location.origin,
      title: document.title.slice(0, 256),
      fields,
      warnings,
    };
  }
}
