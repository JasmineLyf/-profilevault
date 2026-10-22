import { planSchema, type FillPlan, type FieldResult, type Value } from '../core/protocol';
import { calendarDate } from '../core/schema';
import {
  type Scanner,
  type RecordEntry,
  type Control,
  visible,
  state,
  same,
  radioGroup,
} from './scanner';
import { Undo, writeNative } from './undo';
import { isCombobox, selectCombobox } from './combobox';
import { attachResume, fileCompatible } from './files';
function compatibleValue(el: Control, value: Value) {
  if (isCombobox(el)) return typeof value === 'string' && value.length <= 256;
  if (el instanceof HTMLInputElement) {
    if (el.type === 'file') return fileCompatible(el, value);
    if (['radio', 'checkbox'].includes(el.type))
      return typeof value === 'boolean' && (el.type !== 'radio' || value);
    if (typeof value !== 'string') return false;
    if (el.type === 'number') return false;
    if (el.type === 'date' && !calendarDate.safeParse(value).success) return false;
    if (el.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;
    if (el.maxLength >= 0 && value.length > el.maxLength) return false;
  }
  if (
    el instanceof HTMLTextAreaElement &&
    (typeof value !== 'string' || (el.maxLength >= 0 && value.length > el.maxLength))
  )
    return false;
  if (el instanceof HTMLSelectElement) {
    const requested = el.multiple ? value : [value];
    if (
      !Array.isArray(requested) ||
      requested.some((v) => typeof v !== 'string') ||
      new Set(requested).size !== requested.length
    )
      return false;
    for (const v of requested) {
      const options = Array.from(el.options).filter((o) => o.value === v);
      if (
        options.length !== 1 ||
        options[0].disabled ||
        (options[0].parentElement instanceof HTMLOptGroupElement &&
          options[0].parentElement.disabled)
      )
        return false;
    }
  }
  // Check browser constraints on an unattached clone; never trial-write to the live page.
  if (typeof value === 'string' && !(el instanceof HTMLSelectElement)) {
    const clone = el.cloneNode(false) as HTMLInputElement | HTMLTextAreaElement;
    clone.value = value;
    if (clone.value !== value || !clone.checkValidity()) return false;
    if (el.getAttribute('pattern')) {
      try {
        if (!new RegExp('^(?:' + el.getAttribute('pattern') + ')$', 'v').test(value)) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}
export class Filler {
  private used = new Set<string>();
  private busy = false;
  readonly undo: Undo;
  constructor(private scanner: Scanner) {
    this.undo = new Undo((el) => scanner.features(el, '').semanticFingerprint);
  }
  private check(record: RecordEntry, item: FillPlan['fields'][number]) {
    const fresh = this.scanner.features(record.el, item.fieldId);
    if (fresh.blocked) return fresh.blocked;
    if (
      !visible(record.el) ||
      fresh.semanticFingerprint !== item.semanticFingerprint ||
      record.features.semanticFingerprint !== item.semanticFingerprint
    )
      return '控件语义或结构变化，请重新扫描';
    if (
      !same(state(record.el), record.before) ||
      (record.files &&
        record.el instanceof HTMLInputElement &&
        (record.files.length !== (record.el.files?.length ?? 0) ||
          record.files.some((file, i) => file !== (record.el as HTMLInputElement).files?.[i]))) ||
      record.group.some((g) => !g.el.isConnected || !same(state(g.el), g.before)) ||
      radioGroup(record.el).length !== record.group.length
    )
      return '预览后网页值变化，请重新扫描';
    if (
      record.el instanceof HTMLInputElement &&
      record.el.type === 'file' &&
      item.sourceFieldId !== 'resume.file'
    )
      return '文件上传仅接受本次批准的简历附件';
    if (fresh.hasValue && !item.overwriteApproved) return '已有值，未批准覆盖';
    if (
      (item.sourceFieldId === 'person.birthDate' ||
        fresh.type === 'date' ||
        /bday|birth|生日|出生/i.test(
          [fresh.label, fresh.autocomplete, fresh.name, fresh.id].join(' '),
        )) &&
      !item.sensitiveApproved
    )
      return '敏感项未逐项批准';
    if (!compatibleValue(record.el, item.value)) return '值与控件约束不兼容';
  }
  async fill(input: FillPlan): Promise<FieldResult[]> {
    const plan = planSchema.parse(input),
      now = Date.now();
    if (
      this.busy ||
      !this.scanner.isCurrentDocument() ||
      this.used.has(plan.operationId) ||
      this.used.size >= 1000 ||
      plan.expiresAt < now ||
      plan.expiresAt > now + 60000 ||
      plan.expectedOrigin !== location.origin ||
      plan.documentToken !== this.scanner.documentToken ||
      plan.scanId !== this.scanner.scanId
    )
      throw Error('STALE_PLAN');
    this.used.add(plan.operationId);
    this.busy = true;
    this.undo.set([]);
    try {
      const initial = plan.fields.map((item) => {
        const record = this.scanner.records.get(item.fieldId);
        return { item, record, error: record ? this.check(record, item) : '元素不存在' };
      });
      const radios = initial.filter(
        (x) => x.record?.el instanceof HTMLInputElement && x.record.el.type === 'radio',
      );
      if (
        radios.some((x, i) =>
          radios.slice(i + 1).some((y) => radioGroup(x.record!.el).includes(y.record!.el)),
        )
      )
        throw Error('RADIO_CONFLICT');
      const results: FieldResult[] = [];
      for (const { item, record, error } of initial) {
        const invalidSession =
          !this.scanner.isCurrentDocument() ||
          plan.scanId !== this.scanner.scanId ||
          plan.documentToken !== this.scanner.documentToken ||
          Date.now() > plan.expiresAt;
        const failure = invalidSession
          ? '扫描会话已清除或计划过期'
          : (error ?? (record ? this.check(record, item) : '元素不存在'));
        if (failure || !record) {
          results.push({
            fieldId: item.fieldId,
            status: 'skipped',
            reason: failure ?? '元素不存在',
          });
          continue;
        }
        try {
          if (isCombobox(record.el)) {
            await selectCombobox(
              record.el,
              String(item.value),
              item.sourceFieldId,
              () =>
                this.scanner.isCurrentDocument() &&
                this.scanner.scanId === plan.scanId &&
                Date.now() <= plan.expiresAt &&
                !this.scanner.features(record.el, item.fieldId).blocked &&
                this.scanner.features(record.el, item.fieldId).semanticFingerprint ===
                  item.semanticFingerprint,
            );
            results.push({
              fieldId: item.fieldId,
              status: 'written',
              reason: '已精确选择并检查下拉项；自绘控件不支持扩展撤销，请在网页检查。',
            });
            continue;
          }
          if (record.el instanceof HTMLInputElement && record.el.type === 'file') {
            attachResume(record.el, item.value);
            const attached = record.el.files?.[0];
            await new Promise((r) => setTimeout(r, 170));
            if (!record.el.isConnected || record.el.files?.[0] !== attached)
              throw Error('FILE_REVERTED');
            results.push({
              fieldId: item.fieldId,
              status: 'written',
              reason: '已附加批准的简历文件。网站可能立即上传；文件上传无法由扩展撤回。',
            });
            continue;
          }
          const before = state(record.el),
            group = radioGroup(record.el).map((el) => ({
              el,
              before: state(el),
              after: state(el),
            }));
          writeNative(record.el, item.value);
          for (const g of group) g.after = state(g.el);
          const after = state(record.el);
          this.undo.add({
            fieldId: item.fieldId,
            el: record.el,
            before,
            after,
            fingerprint: item.semanticFingerprint,
            group,
          });
          let retained = same(after, item.value),
            connected = record.el.isConnected;
          for (const ms of [70, 100]) {
            await new Promise((r) => setTimeout(r, ms));
            retained = retained && same(state(record.el), item.value);
            connected = connected && record.el.isConnected && this.scanner.isCurrentDocument();
          }
          results.push({
            fieldId: item.fieldId,
            status: !connected ? 'changed' : retained ? 'written' : 'reverted',
            reason: !connected
              ? '页面重建控件，请重新扫描'
              : retained
                ? '已写入并在两次检查时保持'
                : '页面回退或拒绝该值',
          });
          if (!connected || !retained) this.undo.remove(item.fieldId);
        } catch (error) {
          const code = error instanceof Error ? error.message : '';
          const reason =
            code === 'COMBO_NO_EXACT_OPTION'
              ? '未找到唯一匹配的下拉项，请手动选择或修改拟填值。'
              : ['COMBO_AMBIGUOUS', 'COMBO_VIRTUAL_AMBIGUITY', 'COMBO_LIMIT'].includes(code)
                ? '下拉选项重复、未完整加载或超出限制，未猜测选择。'
                : code === 'COMBO_STALE'
                  ? '控件或页面已变化，请重新扫描。'
                  : code === 'COMBO_REVERTED'
                    ? '网页没有保持所选下拉项，请手动检查。'
                    : code === 'FILE_REVERTED'
                      ? '网页替换控件或移除了附件，请手动检查。'
                      : '写入失败，请检查网页';
          results.push({ fieldId: item.fieldId, status: 'failed', reason });
        }
      }
      return results;
    } finally {
      this.busy = false;
    }
  }
}
