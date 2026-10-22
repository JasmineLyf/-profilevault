import type { FieldResult, Value } from '../core/protocol';
import { type Control, radioGroup, same, state, visible } from './scanner';
export function writeNative(el: Control, value: Value) {
  if (el instanceof HTMLInputElement && ['radio', 'checkbox'].includes(el.type)) {
    if (typeof value !== 'boolean') throw Error('TYPE');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')!.set!.call(el, value);
  } else if (el instanceof HTMLSelectElement && el.multiple) {
    if (!Array.isArray(value)) throw Error('TYPE');
    for (const option of el.options)
      Object.getOwnPropertyDescriptor(HTMLOptionElement.prototype, 'selected')!.set!.call(
        option,
        value.includes(option.value),
      );
  } else {
    if (typeof value !== 'string') throw Error('TYPE');
    const proto =
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  }
  // React's checkable ChangeEventPlugin observes click events. A plain Event has no
  // MouseEvent activation behavior: it does not invoke .click() or toggle the control.
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type))
    el.dispatchEvent(new Event('click', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
interface Snapshot {
  fieldId: string;
  el: Control;
  before: Value;
  after: Value;
  fingerprint: string;
  edited: boolean;
  group: { el: Control; before: Value; after: Value }[];
}
export class Undo {
  private snapshots: Snapshot[] = [];
  private deadline = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private fingerprint: (el: Control) => string) {
    const listener = (event: Event) => {
      for (const s of this.snapshots)
        if (s.el === event.target || s.group.some((g) => g.el === event.target)) s.edited = true;
    };
    document.addEventListener('input', listener, true);
    document.addEventListener('change', listener, true);
    window.addEventListener('pagehide', () => this.clear());
  }
  clear() {
    this.snapshots = [];
    this.deadline = 0;
    clearTimeout(this.timer);
  }
  set(snapshots: Omit<Snapshot, 'edited'>[]) {
    this.clear();
    this.snapshots = snapshots.map((s) => ({ ...s, edited: false }));
    this.deadline = Date.now() + 120000;
    this.timer = setTimeout(() => this.clear(), 120000);
  }
  add(snapshot: Omit<Snapshot, 'edited'>) {
    this.snapshots.push({ ...snapshot, edited: false });
  }
  remove(fieldId: string) {
    this.snapshots = this.snapshots.filter((s) => s.fieldId !== fieldId);
  }
  restore(): FieldResult[] {
    if (!this.deadline || Date.now() > this.deadline) {
      this.clear();
      return [{ fieldId: '', status: 'expired', reason: '撤销缓存已失效' }];
    }
    const snapshots = this.snapshots;
    this.snapshots = [];
    const results: FieldResult[] = snapshots.map((s) => {
      const result: FieldResult = {
        fieldId: s.fieldId,
        status: 'changed',
        reason: '页面结构或状态已变化',
      };
      if (s.edited) return { ...result, status: 'edited', reason: '填写后发生过编辑，跳过' };
      const currentGroup = radioGroup(s.el);
      if (
        !visible(s.el) ||
        this.fingerprint(s.el) !== s.fingerprint ||
        !same(state(s.el), s.after) ||
        currentGroup.length !== s.group.length ||
        s.group.some(
          (g) => !g.el.isConnected || !currentGroup.includes(g.el) || !same(state(g.el), g.after),
        )
      )
        return result;
      try {
        for (const g of s.group) if (g.el !== s.el) writeNative(g.el, g.before);
        writeNative(s.el, s.before);
        if (!s.el.isConnected || !same(state(s.el), s.before))
          return { ...result, status: 'failed', reason: '页面拒绝恢复或重建控件' };
        return {
          ...result,
          status: 'restored',
          reason: '已恢复 DOM 状态；无法撤回网站已读取的数据',
        };
      } catch {
        return { ...result, status: 'failed', reason: '恢复失败' };
      }
    });
    this.clear();
    return results;
  }
}
