import { normalize, uniqueOption, cityAliases } from '../core/normalize';
import type { FieldId } from '../core/field-catalog';
import { countryAliases } from '../core/field-catalog';
import { degreeAliases } from '../core/recruiting';
export function isCombobox(el: Element) {
  return (
    el.getAttribute('role') === 'combobox' &&
    !(el instanceof HTMLSelectElement) &&
    (!(el instanceof HTMLInputElement) || ['text', 'search'].includes(el.type)) &&
    (!(el instanceof HTMLButtonElement) || el.type === 'button')
  );
}
export function comboboxSurface(el: Element): Element {
  if (
    isCombobox(el) &&
    el instanceof HTMLInputElement &&
    el.getAttribute('aria-readonly') === 'true' &&
    el.className.includes('dummyInput')
  )
    return el.closest('[class*="-control"], [class*="__control"]') ?? el;
  return el;
}
function comboRoot(el: Element) {
  const explicit = el.closest('[data-combobox]');
  if (explicit) return explicit;
  const control = el.closest('[class*="-control"], [class*="__control"]');
  if (control?.parentElement) return control.parentElement;
  return (
    el.closest(
      '[data-combobox], [class*="-container"], [class*="select__container"], [class*="Select"]',
    ) ??
    el.parentElement ??
    el
  );
}
export function comboboxValue(el: HTMLElement) {
  const explicit = el.getAttribute('aria-valuetext');
  if (explicit) return explicit;
  const root = comboRoot(el),
    selected = root.querySelector(
      '[class*="singleValue"], [class*="single-value"], [data-selected-value]',
    );
  if (selected?.textContent) return selected.textContent.trim();
  if (el instanceof HTMLInputElement) return el.value;
  const text = el.textContent?.trim() ?? '';
  return /^(select(?:\.\.\.)?|select an option|请选择|选择)$/i.test(text) ? '' : text;
}
function listFor(el: HTMLElement): HTMLElement | null {
  for (const id of (el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns') ?? '').split(
    /\s+/,
  )) {
    const root = document.getElementById(id);
    const list =
      root?.getAttribute('role') === 'listbox'
        ? root
        : root?.querySelector<HTMLElement>('[role="listbox"]');
    if (list) return list as HTMLElement;
  }
  return comboRoot(el).querySelector<HTMLElement>('[role="listbox"]');
}
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function selectCombobox(
  el: HTMLElement,
  value: string,
  field: FieldId | undefined,
  valid: () => boolean,
) {
  if (!isCombobox(el) || !valid()) throw Error('COMBO_STALE');
  el.focus();
  await delay(80);
  if (!listFor(el)) {
    if (el instanceof HTMLButtonElement && el.type !== 'button') throw Error('COMBO_UNSAFE_BUTTON');
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    el.click();
    await delay(100);
  }
  if (!valid()) throw Error('COMBO_STALE');
  const input = el instanceof HTMLInputElement ? el : el.querySelector<HTMLInputElement>('input');
  const searchable =
    input && !input.readOnly && !input.disabled && input.getAttribute('aria-readonly') !== 'true';
  const priorSearch = searchable ? input.value : undefined;
  try {
    if (searchable) {
      const searchValue =
        field === 'address.city'
          ? (cityAliases
              .find((a) => a.map(normalize).includes(normalize(value)))
              ?.find((a) => /^[a-z]/i.test(a)) ?? value)
          : field === 'address.countryCode'
            ? (countryAliases[value]?.find((a) => /[a-z]/i.test(a)) ?? value)
            : field === 'education.degree'
              ? (Object.values(degreeAliases)
                  .find((a) => a.map(normalize).includes(normalize(value)))
                  ?.find((a) =>
                    /^(doctor of philosophy|bachelor|master|associate|high school)$/i.test(a),
                  ) ?? value)
              : value;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        searchValue,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    for (let tick = 0; tick < 24; tick++) {
      if (!valid()) throw Error('COMBO_STALE');
      if (searchable && (tick === 8 || tick === 16)) {
        const aliases =
          field === 'address.countryCode'
            ? countryAliases[value]
            : field === 'address.city'
              ? cityAliases.find((a) => a.map(normalize).includes(normalize(value)))
              : undefined;
        const query =
          tick === 8 ? (aliases?.find((a) => /[\p{Script=Han}]/u.test(a)) ?? value) : value;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          query,
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await delay(100);
      }
      const list = listFor(el);
      if (!list) {
        await delay(100);
        continue;
      }
      let options = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
      if (options.length > 500) throw Error('COMBO_LIMIT');
      const descriptors = options.map((o, i) => ({
        value: o.getAttribute('data-value') ?? String(i),
        text: o.textContent?.trim() ?? '',
        disabled: o.getAttribute('aria-disabled') === 'true' || o.hasAttribute('disabled'),
      }));
      const choice = uniqueOption(descriptors, value, field);
      if (choice !== undefined) {
        const index = descriptors.findIndex((o) => o.value === choice),
          target = options[index];
        const size = Number(target.getAttribute('aria-setsize') ?? options.length);
        if (size > options.length) throw Error('COMBO_VIRTUAL_AMBIGUITY');
        if (
          !target.isConnected ||
          target.getAttribute('aria-disabled') === 'true' ||
          (target instanceof HTMLButtonElement && target.type !== 'button') ||
          !valid()
        )
          throw Error('COMBO_UNSAFE_OPTION');
        target.click();
        await delay(100);
        const actual = normalize(comboboxValue(el));
        if (
          actual === normalize(value) ||
          uniqueOption(
            [{ value: 'selected', text: comboboxValue(el), disabled: false }],
            value,
            field,
          ) === 'selected'
        )
          return;
        throw Error('COMBO_REVERTED');
      }
      if (descriptors.filter((o) => normalize(o.text) === normalize(value)).length > 1)
        throw Error('COMBO_AMBIGUOUS');
      // Bounded scrolling of the associated list; never wheel the page or another control.
      if (!searchable && list.scrollHeight > list.clientHeight && tick < 8)
        list.scrollTop = Math.min(
          list.scrollHeight,
          list.scrollTop + Math.max(80, list.clientHeight),
        );
      await delay(100);
      options = [];
    }
    throw Error('COMBO_NO_EXACT_OPTION');
  } catch (error) {
    if (searchable && input.isConnected && valid() && priorSearch !== undefined) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        priorSearch,
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    throw error;
  }
}
