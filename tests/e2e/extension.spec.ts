import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { action, initialize, launch, passphrase, rawScan, scan } from './helpers';
import type { ScanResult, FillPlan } from '../../src/core/protocol';
test('real action → encrypted vault → approved fill → conditional undo → lock and backup', async () => {
  const { context, worker, id } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    const external: string[] = [];
    context.on('request', (r) => {
      if (r.url().startsWith('http') && !r.url().startsWith('http://127.0.0.1:4317'))
        external.push(r.url());
    });
    const ui = await action(context, page, id);
    await initialize(ui);
    const stored = await worker.evaluate(async () =>
      JSON.stringify(await chrome.storage.local.get(null)),
    );
    for (const needle of ['乔云', 'qiao.yun', '2025550147', '虚构测试资料'])
      expect(stored).not.toContain(needle);
    await page.evaluate(() => {
      document.title = '虚构页面 · 更新标题';
    });
    await scan(ui);
    await expect(ui.getByText('虚构页面 · 更新标题', { exact: true })).toBeVisible();
    const previewA11y = await new AxeBuilder({ page: ui }).analyze();
    expect(previewA11y.violations).toEqual([]);
    await expect(page.locator('#full')).toHaveValue('');
    await expect(ui.getByRole('button', { name: /填写已选/ })).toBeEnabled();
    const name = ui
      .locator('.preview-row')
      .filter({ has: ui.getByRole('checkbox', { name: '填写 姓名', exact: true }) });
    const email = ui
      .locator('.preview-row:not(.blocked)')
      .filter({ has: ui.getByRole('checkbox', { name: '填写 邮箱', exact: true }) });
    await name.getByRole('checkbox', { name: '填写 姓名', exact: true }).check();
    await email.getByRole('checkbox', { name: '填写 邮箱', exact: true }).check();
    await expect(
      ui.getByRole('checkbox', { name: '填写 出生日期', exact: true }),
    ).not.toBeChecked();
    await expect(ui.getByRole('checkbox', { name: '填写 验证码', exact: true })).toBeDisabled();
    await ui.getByRole('button', { name: /填写已选/ }).click();
    await expect(page.locator('#full')).toHaveValue('乔云');
    await expect(page.locator('#mail')).toHaveValue('qiao.yun@example.test');
    await page.locator('#mail').fill('user.edit@example.test');
    await ui.getByRole('button', { name: '撤销本次填写', exact: true }).click();
    await expect(page.locator('#full')).toHaveValue('');
    await expect(page.locator('#mail')).toHaveValue('user.edit@example.test');
    await expect(page.locator('#submits')).toHaveText('0');
    await ui.getByRole('button', { name: '备份与安全', exact: true }).click();
    const downloadEvent = ui.waitForEvent('download');
    await ui.getByRole('button', { name: '导出加密备份', exact: true }).click();
    const downloaded = await downloadEvent;
    const path = await downloaded.path();
    expect(path).toBeTruthy();
    const backup = await readFile(path!, 'utf8');
    expect(backup).not.toContain('乔云');
    await ui.getByLabel('加密备份文件').setInputFiles({
      name: 'backup.profilevault.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
    await ui.getByLabel('该备份的口令').fill('wrong password');
    await ui.getByRole('button', { name: '验证备份并预览' }).click();
    await expect(ui.getByText('口令错误或文件已损坏', { exact: true })).toBeVisible();
    expect(
      await worker.evaluate(async () => JSON.stringify(await chrome.storage.local.get(null))),
    ).toBe(stored);
    await ui.getByLabel('该备份的口令').fill(passphrase);
    await ui.getByRole('button', { name: '验证备份并预览' }).click();
    await expect(ui.getByRole('heading', { name: '替换预览 · 1 个档案' })).toBeVisible();
    await ui.getByRole('button', { name: '确认整库替换' }).click();
    await expect(ui.getByRole('heading', { name: '解锁你的资料库' })).toBeVisible();
    await ui.getByLabel('主口令', { exact: true }).fill(passphrase);
    await ui.getByRole('button', { name: '解锁资料库', exact: true }).click();
    await expect(ui.getByLabel('完整姓名', { exact: true })).toHaveValue('乔云');
    await mkdir('docs/screenshots', { recursive: true });
    await ui.screenshot({ path: 'docs/screenshots/profiles.png', fullPage: true });
    const a11y = await new AxeBuilder({ page: ui }).analyze();
    expect(a11y.violations).toEqual([]);
    await writeFile(
      `docs/validation/accessibility-${process.env.PV_BROWSER ?? 'chrome'}.json`,
      JSON.stringify(
        { editorViolations: a11y.violations, previewViolations: previewA11y.violations },
        null,
        2,
      ),
    );
    await ui.reload();
    await expect(ui.getByRole('heading', { name: '解锁你的资料库' })).toBeVisible();
    expect(external).toEqual([]);
    console.info('Browser:', context.browser()?.version());
  } finally {
    await context.close();
  }
});
test('React controlled text/select/onChange checkables synchronize with submit-handler state', async () => {
  const { context, worker, id } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/react');
    const ui = await action(context, page, id);
    await initialize(ui);
    await scan(ui);
    for (const [id, value] of [
      ['react-name', '乔云'],
      ['react-country', 'CN'],
      ['react-check', true],
      ['react-radio', true],
    ] as const) {
      const s = (await rawScan(ui, worker)) as ScanResult;
      const f = s.fields.find((f) => f.id === id)!;
      const plan: FillPlan = {
        protocolVersion: 1,
        operationId: crypto.randomUUID(),
        scanId: s.scanId,
        documentToken: s.documentToken,
        expectedOrigin: s.origin,
        expiresAt: Date.now() + 60000,
        fields: [
          {
            fieldId: f.fieldId,
            semanticFingerprint: f.semanticFingerprint,
            value,
            overwriteApproved: false,
            sensitiveApproved: false,
          },
        ],
      };
      const result = await ui.evaluate(async (plan) => {
        const { session } = await chrome.storage.session.get('session');
        return await chrome.tabs.sendMessage(
          session.target.tabId,
          { type: 'FILL', plan },
          { frameId: 0 },
        );
      }, plan);
      expect(result[0].status).toBe('written');
    }
    const expected = JSON.stringify({ name: '乔云', country: 'CN', checked: true, time: 'am' });
    await expect(page.locator('#state')).toHaveText(expected);
    await expect(page.locator('#submits')).toHaveText('0');
    // Only the test, acting as the user, submits to inspect the actual React handler state.
    await page.getByRole('button', { name: '用户提交' }).click();
    await expect(page.locator('#submitted')).toHaveText(expected);
    await expect(page.locator('#submits')).toHaveText('1');
  } finally {
    await context.close();
  }
});
test('target remains bound after tab switch; inactivity and window close require unlock', async () => {
  const { context, worker, id } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    let ui = await action(context, page, id);
    await initialize(ui);
    const other = await context.newPage();
    await other.goto('http://127.0.0.1:4317/react');
    await other.bringToFront();
    await scan(ui);
    const s = (await rawScan(ui, worker)) as ScanResult;
    expect(s.title).toBe('虚构联系表单');
    await expect(other.locator('#react-name')).toHaveValue('');
    await ui.clock.install();
    await ui.clock.fastForward(5 * 60000 + 1000);
    await expect(ui.getByRole('heading', { name: '解锁你的资料库' })).toBeVisible();
    await ui.getByLabel('主口令', { exact: true }).fill(passphrase);
    await ui.getByRole('button', { name: '解锁资料库', exact: true }).click();
    await expect(ui.getByLabel('完整姓名', { exact: true })).toHaveValue('乔云');
    await ui.close();
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
test('protocol rejects replay, mutation, forbidden overrides and stale navigation; supports native controls', async () => {
  const { context, worker, id } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    const ui = await action(context, page, id);
    await initialize(ui);
    await scan(ui);
    async function getScan() {
      return (await rawScan(ui, worker)) as ScanResult;
    }
    async function sendPlan(
      s: ScanResult,
      fieldName: string,
      value: string | boolean,
      overrides: object = {},
    ) {
      const f = s.fields.find((f) => f.id === fieldName)!;
      const plan: FillPlan = {
        protocolVersion: 1,
        operationId: crypto.randomUUID(),
        scanId: s.scanId,
        documentToken: s.documentToken,
        expectedOrigin: s.origin,
        expiresAt: Date.now() + 60000,
        fields: [
          {
            fieldId: f.fieldId,
            semanticFingerprint: f.semanticFingerprint,
            value,
            overwriteApproved: true,
            sensitiveApproved: true,
            ...overrides,
          },
        ],
      };
      const result = await ui.evaluate(async (plan) => {
        const { session } = await chrome.storage.session.get('session');
        return await chrome.tabs.sendMessage(
          session.target.tabId,
          { type: 'FILL', plan },
          { frameId: 0 },
        );
      }, plan);
      return { result, plan };
    }
    for (const [field, value] of [
      ['country', 'CN'],
      ['zip', '000000'],
      ['birth', '1994-04-12'],
      ['catalog', true],
      ['afternoon', true],
    ] as const) {
      const s = await getScan();
      const { result } = await sendPlan(s, field, value);
      expect(result[0].status).toBe('written');
    }
    await expect(page.locator('#country')).toHaveValue('CN');
    await expect(page.locator('#zip')).toHaveValue('000000');
    await expect(page.locator('#afternoon')).toBeChecked();
    await expect(page.locator('#morning')).not.toBeChecked();
    for (const name of ['otp', 'card', 'passport', 'agree', 'password']) {
      const s = await getScan();
      const { result } = await sendPlan(s, name, name === 'agree' ? true : 'evil');
      expect(result[0].status).toBe('skipped');
    }
    let s = await getScan();
    await page.locator('#full').fill('new page value');
    expect((await sendPlan(s, 'full', '乔云')).result[0].status).toBe('skipped');
    s = await getScan();
    const { plan } = await sendPlan(s, 'full', '乔云');
    const replay = await ui.evaluate(async (plan) => {
      const { session } = await chrome.storage.session.get('session');
      return await chrome.tabs.sendMessage(
        session.target.tabId,
        { type: 'FILL', plan },
        { frameId: 0 },
      );
    }, plan);
    expect(replay.error).toBeTruthy();
    s = await getScan();
    await page.locator('#mail').evaluate((el) => el.replaceWith(el.cloneNode()));
    expect((await sendPlan(s, 'mail', 'qiao.yun@example.test')).result[0].status).toBe('skipped');
    s = await getScan();
    await page.evaluate(() => history.pushState({}, '', '/changed-route'));
    expect((await sendPlan(s, 'full', '乔云')).result.error).toBeTruthy();
    await page.evaluate(() => history.replaceState({}, '', '/'));
    await page.reload();
    await expect(page.locator('#full')).toHaveValue('');
    await expect(
      ui.evaluate(async (plan) => {
        const { session } = await chrome.storage.session.get('session');
        return await chrome.tabs.sendMessage(
          session.target.tabId,
          { type: 'FILL', plan },
          { frameId: 0 },
        );
      }, plan),
    ).rejects.toThrow();
    await expect(page.locator('#submits')).toHaveText('0');
  } finally {
    await context.close();
  }
});
