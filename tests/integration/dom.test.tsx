// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { Scanner } from '../../src/content/scanner';
import { Filler } from '../../src/content/filler';
import type { FillPlan, ScanResult, Value } from '../../src/core/protocol';
let scanner: Scanner, filler: Filler;
function plan(scan: ScanResult, id: string, value: Value, patch: object = {}): FillPlan {
  const f = scan.fields.find((f) => f.id === id)!;
  return {
    protocolVersion: 1,
    operationId: crypto.randomUUID(),
    scanId: scan.scanId,
    documentToken: scan.documentToken,
    expectedOrigin: location.origin,
    expiresAt: Date.now() + 60000,
    fields: [
      {
        fieldId: f.fieldId,
        semanticFingerprint: f.semanticFingerprint,
        value,
        overwriteApproved: false,
        sensitiveApproved: false,
        ...patch,
      },
    ],
  };
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([
    { width: 100, height: 30 },
  ] as unknown as DOMRectList);
  document.body.innerHTML =
    '<form><label>姓名<input id="name" autocomplete="name"></label><label>邮箱<input id="email" type="email"></label><label>验证码<input id="otp" autocomplete="email"></label><label>同意隐私<input id="consent" type="checkbox"></label><label>出生日期<input id="birthday" type="date"></label><input id="existing" value="original"><select id="country"><option value="">请选择</option><option value="CN">中国</option></select></form>';
  scanner = new Scanner();
  filler = new Filler(scanner);
});
afterEach(() => {
  filler.undo.clear();
  vi.restoreAllMocks();
});
describe('DOM safety boundaries', () => {
  it('never returns existing values and refuses prohibited manual overrides', async () => {
    const forbidden = document.createElement('input');
    forbidden.type = 'password';
    forbidden.setAttribute('role', 'combobox');
    forbidden.setAttribute('aria-label', 'School');
    Object.defineProperty(forbidden, 'value', {
      get: () => {
        throw Error('FORBIDDEN_VALUE_READ');
      },
    });
    document.body.append(forbidden);
    (document.getElementById('otp') as HTMLInputElement).value = 'never-retain-forbidden-value';
    const scan = scanner.scan();
    expect(JSON.stringify(scan)).not.toContain('original');
    expect(JSON.stringify(scan)).not.toContain('never-retain-forbidden-value');
    for (const field of scan.fields.filter((f) => f.blocked)) {
      expect(scanner.records.has(field.fieldId)).toBe(false);
      expect(field.hasValue).toBe(false);
    }
    for (const id of ['otp', 'consent'])
      expect(
        (
          await filler.fill(
            plan(scan, id, id === 'consent' ? true : 'data', {
              overwriteApproved: true,
              sensitiveApproved: true,
            }),
          )
        )[0].status,
      ).toBe('skipped');
    document.body.insertAdjacentHTML(
      'beforeend',
      '<form><label>普通业务选项<input id="ordinary-radio" type="radio" name="mixed"></label><label>同意隐私条款<input type="radio" name="mixed" checked></label></form>',
    );
    const mixed = scanner.scan();
    expect(mixed.fields.find((f) => f.id === 'ordinary-radio')?.blocked).toBeTruthy();
    expect(
      (await filler.fill(plan(mixed, 'ordinary-radio', true, { overwriteApproved: true })))[0]
        .status,
    ).toBe('skipped');
  });
  it('protects nonempty values and detects preview edits, replacement nodes and semantic mutations', async () => {
    let scan = scanner.scan();
    expect((await filler.fill(plan(scan, 'existing', 'replacement')))[0].status).toBe('skipped');
    (document.getElementById('name') as HTMLInputElement).value = 'page edit';
    expect(
      (await filler.fill(plan(scan, 'name', '乔云', { overwriteApproved: true })))[0].status,
    ).toBe('skipped');
    scan = scanner.scan();
    document.getElementById('name')!.replaceWith(document.getElementById('name')!.cloneNode());
    expect(
      (await filler.fill(plan(scan, 'name', '乔云', { overwriteApproved: true })))[0].status,
    ).toBe('skipped');
    scan = scanner.scan();
    document.getElementById('name')!.setAttribute('autocomplete', 'one-time-code');
    expect(
      (await filler.fill(plan(scan, 'name', '乔云', { overwriteApproved: true })))[0].status,
    ).toBe('skipped');
  });
  it('enforces expiry, unique operation ids and document identity', async () => {
    const scan = scanner.scan(),
      p = plan(scan, 'name', '乔云');
    expect((await filler.fill(p))[0].status).toBe('written');
    await expect(filler.fill(p)).rejects.toThrow('STALE_PLAN');
    await expect(
      filler.fill({ ...p, operationId: crypto.randomUUID(), documentToken: crypto.randomUUID() }),
    ).rejects.toThrow('STALE_PLAN');
    await expect(
      filler.fill({ ...p, operationId: crypto.randomUUID(), expiresAt: Date.now() + 61000 }),
    ).rejects.toThrow('STALE_PLAN');
  });
  it('requires sensitive approval and checks value constraints before writing', async () => {
    const scan = scanner.scan();
    expect((await filler.fill(plan(scan, 'birthday', '1994-04-12')))[0].status).toBe('skipped');
    expect(
      (await filler.fill(plan(scan, 'birthday', '2025-02-29', { sensitiveApproved: true })))[0]
        .status,
    ).toBe('skipped');
    expect((await filler.fill(plan(scan, 'email', 'invalid email')))[0].status).toBe('skipped');
  });
  it('restores eligible fields but preserves edit history even after value is changed back', async () => {
    let scan = scanner.scan();
    await filler.fill(plan(scan, 'name', '乔云'));
    expect(filler.undo.restore()[0].status).toBe('restored');
    expect((document.getElementById('name') as HTMLInputElement).value).toBe('');
    scan = scanner.scan();
    await filler.fill(plan(scan, 'name', '乔云'));
    const el = document.getElementById('name') as HTMLInputElement;
    el.value = 'other';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.value = '乔云';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    expect(filler.undo.restore()[0].status).toBe('edited');
    expect(el.value).toBe('乔云');
  });
  it('reports page rollback and refuses duplicate select values', async () => {
    const el = document.getElementById('name')!;
    el.addEventListener('input', () => {
      (el as HTMLInputElement).value = '';
    });
    let scan = scanner.scan();
    expect((await filler.fill(plan(scan, 'name', '乔云')))[0].status).toBe('reverted');
    document
      .getElementById('country')!
      .insertAdjacentHTML('beforeend', '<option value="CN">另一个中国</option>');
    scan = scanner.scan();
    expect((await filler.fill(plan(scan, 'country', 'CN')))[0].status).toBe('skipped');
  });
});
