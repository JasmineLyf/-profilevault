import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release } from 'node:os';
import { action, initialize, launch, passphrase, rawScan, scan } from './helpers';
import { standardCases, forbiddenCases, ambiguousCases } from '../fixtures/matching-cases';
import { match } from '../../src/core/matcher';
import type { FillPlan, ScanResult } from '../../src/core/protocol';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
test('visible evaluation corpus, repeat sections, scan performance and 500 limit', async () => {
  const { context, worker, id } = await launch();
  try {
    const cases = [
      ...standardCases.map(([label, expected]) => ({ label, expected, kind: 'standard' })),
      ...forbiddenCases.map((label) => ({ label, expected: '', kind: 'forbidden' })),
      ...ambiguousCases.map((label) => ({ label, expected: '', kind: 'ambiguous' })),
    ];
    const html =
      '<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>Visible evaluation fixture</title><style>label{display:block;margin:5px}input{width:200px;height:25px}</style><form>' +
      cases.map((c, i) => `<label>${escape(c.label)}<input id="case-${i}"></label>`).join('') +
      '</form><form aria-label="收货"><label>姓名<input autocomplete="shipping name"></label><label>邮箱<input autocomplete="shipping email"></label></form><form aria-label="账单"><label>姓名<input autocomplete="billing name"></label><label>邮箱<input autocomplete="billing email"></label></form></html>';
    await mkdir('docs/evaluation', { recursive: true });
    await writeFile('docs/evaluation/visible-fixture.html', html);
    await context.route('https://evaluation.example.test/**', (route) =>
      route.fulfill({ body: html, contentType: 'text/html' }),
    );
    const page = await context.newPage();
    await page.goto('https://evaluation.example.test/');
    const ui = await action(context, page, id);
    await initialize(ui);
    await scan(ui);
    const result = (await rawScan(ui, worker)) as ScanResult;
    let preselected = 0,
      correct = 0,
      covered = 0;
    for (const f of result.fields) {
      if (!f.id.startsWith('case-')) continue;
      const m = match(f, result.origin, true),
        annotation = cases[Number(f.id.replace('case-', ''))];
      if (!annotation) continue;
      if (annotation.kind === 'standard' && m.candidateField === annotation.expected) covered++;
      if (m.decision === 'preselect') {
        preselected++;
        if (m.candidateField === annotation.expected) correct++;
      }
      if (annotation.kind === 'forbidden') expect(m.decision, f.label).toBe('blocked');
    }
    const repeated = result.fields.filter((f) => !f.id);
    for (const f of repeated) expect(match(f, result.origin, false).decision).not.toBe('preselect');
    const evaluation = {
      visibleFields: result.fields.length,
      standardFields: standardCases.length,
      preselected,
      precision: correct / preselected,
      coverage: covered / standardCases.length,
      repeatSections: repeated.length,
      forbiddenPreselected: 0,
      independentHumanReview: 'pending',
    };
    expect(evaluation.visibleFields).toBeGreaterThanOrEqual(120);
    expect(evaluation.precision).toBeGreaterThanOrEqual(0.98);
    expect(evaluation.coverage).toBeGreaterThanOrEqual(0.8);
    const denied: FillPlan = {
      protocolVersion: 1,
      operationId: crypto.randomUUID(),
      scanId: result.scanId,
      documentToken: result.documentToken,
      expectedOrigin: result.origin,
      expiresAt: Date.now() + 60000,
      fields: result.fields
        .filter(
          (f) => f.id.startsWith('case-') && cases[Number(f.id.slice(5))].kind === 'forbidden',
        )
        .map((f) => ({
          fieldId: f.fieldId,
          semanticFingerprint: f.semanticFingerprint,
          sourceFieldId: 'contact.email',
          value: 'forbidden-test',
          overwriteApproved: true,
          sensitiveApproved: true,
        })),
    };
    const deniedResults = await ui.evaluate(async (plan) => {
      const { session } = await chrome.storage.session.get('session');
      return await chrome.tabs.sendMessage(
        session.target.tabId,
        { type: 'FILL', plan },
        { frameId: 0 },
      );
    }, denied);
    expect(deniedResults).toHaveLength(forbiddenCases.length);
    expect(deniedResults.every((r: { status: string }) => r.status === 'skipped')).toBe(true);
    const performanceResults: Record<string, unknown> = {
      browser: context.browser()?.version(),
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
    };
    for (const n of [100, 500, 501]) {
      await page.evaluate((n) => {
        document.body.innerHTML =
          '<form>' +
          Array.from(
            { length: n },
            (_, i) => `<label>邮箱<input id="field-${i}" autocomplete="email"></label>`,
          ).join('') +
          '</form>';
      }, n);
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const s = (await rawScan(ui, worker)) as ScanResult;
        for (const f of s.fields) match(f, s.origin, true);
        times.push(performance.now() - start);
        expect(s.fields.length).toBe(Math.min(n, 500));
        if (n === 501) expect(s.warnings.join(' ')).toContain('超过 500');
      }
      times.sort((a, b) => a - b);
      performanceResults[String(n)] = {
        medianMs: Math.round(times[2] * 100) / 100,
        runsMs: times.map((t) => Math.round(t * 100) / 100),
      };
      if (n === 100) expect(times[2]).toBeLessThan(300);
    }
    await writeFile(
      `docs/evaluation/results-${process.env.PV_BROWSER ?? 'chrome'}.json`,
      JSON.stringify({ evaluation, performance: performanceResults }, null, 2),
    );
    console.info('Evaluation & performance', evaluation, performanceResults);
  } finally {
    await context.close();
  }
});
test('offline operation, trusted storage, single editor and service-worker restart', async () => {
  const { context, worker, id } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    let ui = await action(context, page, id);
    await context.setOffline(true);
    await initialize(ui);
    await scan(ui);
    const duplicate = await context.newPage();
    await duplicate.goto(`chrome-extension://${id}/ui/index.html`);
    await expect(duplicate.getByRole('alert')).toHaveText(
      '已有资料库窗口打开。请关闭此窗口，使用原窗口。',
    );
    await duplicate.close();
    const permissions = await ui.evaluate(async () => await chrome.permissions.getAll());
    expect(permissions.permissions?.sort()).toEqual(['activeTab', 'scripting', 'storage'].sort());
    expect(permissions.origins ?? []).toEqual([]);
    const storageAccess = await ui.evaluate(async () => {
      const { session } = await chrome.storage.session.get('session');
      return await chrome.scripting.executeScript({
        target: { tabId: session.target.tabId },
        func: async () => {
          try {
            await chrome.storage.local.get('vault');
            return 'unexpected-access';
          } catch {
            return 'denied';
          }
        },
      });
    });
    expect(storageAccess[0].result).toBe('denied');
    await ui.getByRole('checkbox', { name: '填写 姓名', exact: true }).check();
    await ui.getByRole('button', { name: /填写已选/ }).click();
    await expect(page.locator('#full')).toHaveValue('乔云');
    await ui.getByRole('button', { name: '撤销本次填写' }).click();
    await expect(page.locator('#full')).toHaveValue('');
    const browserCDP = await context.browser()!.newBrowserCDPSession();
    const targets = await browserCDP.send('Target.getTargets');
    const sw = targets.targetInfos.find(
      (t) => t.type === 'service_worker' && t.url === worker.url(),
    );
    expect(sw).toBeTruthy();
    if (sw) await browserCDP.send('Target.closeTarget', { targetId: sw.targetId });
    await ui.getByRole('button', { name: '立即锁定' }).click();
    await ui.getByLabel('主口令', { exact: true }).fill(passphrase);
    await ui.getByRole('button', { name: '解锁资料库', exact: true }).click();
    await expect(ui.getByLabel('完整姓名', { exact: true })).toHaveValue('乔云');
    await ui.getByRole('button', { name: '备份与安全', exact: true }).click();
    const event = ui.waitForEvent('download');
    await ui.getByRole('button', { name: '导出加密备份' }).click();
    expect((await event).suggestedFilename()).toBe('backup.profilevault.json');
    await ui.close();
    await context.setOffline(false);
    await expect
      .poll(() =>
        worker.evaluate(async () => (await chrome.storage.session.get('session')).session),
      )
      .toBeUndefined();
    ui = await action(context, page, id);
    await expect(ui.getByRole('heading', { name: '解锁你的资料库' })).toBeVisible();
  } finally {
    await context.close();
  }
});
