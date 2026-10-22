import {
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker,
  type CDPSession,
} from '@playwright/test';
import { resolve } from 'node:path';
export const passphrase = '虚构测试专用 long passphrase';
export const send = (session: CDPSession, method: string, params: object = {}) =>
  (session.send as (method: string, params: object) => Promise<unknown>)(method, params);
export async function launch() {
  const path = resolve(process.env.PV_DIST ?? 'dist');
  const context = await chromium.launchPersistentContext('', {
    channel: process.env.PV_BROWSER ?? 'chrome',
    executablePath: process.env.PV_EXECUTABLE,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
    viewport: { width: 1180, height: 900 },
  });
  const cdp = await context.browser()!.newBrowserCDPSession();
  await send(cdp, 'Extensions.loadUnpacked', { path });

  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  await expect.poll(() => worker.evaluate(() => chrome.action.onClicked.hasListeners())).toBe(true);

  return { context, worker, id: worker.url().split('/')[2] };
}
export async function action(context: BrowserContext, page: Page, id: string) {
  await page.bringToFront();
  const cdp = await context.browser()!.newBrowserCDPSession();
  const info = await cdp.send('Target.getTargets', {
    filter: [{ type: 'tab', exclude: false }, { exclude: true }],
  });
  const target = info.targetInfos.find((t) => t.url === page.url());
  if (!target) throw Error('NO_TAB_TARGET');

  const [ui] = await Promise.all([
    context.waitForEvent('page', { timeout: 8000 }),
    send(cdp, 'Extensions.triggerAction', { id, targetId: target.targetId }),
  ]).catch(async (e) => {
    console.info(
      'Startup diagnostic',
      await context.serviceWorkers()[0].evaluate(async () => ({
        session: await chrome.storage.session.get('session'),
        windows: await chrome.windows.getAll({ populate: true }),
      })),
    );
    throw e;
  });
  await ui.waitForURL(`chrome-extension://${id}/ui/index.html`);
  await expect(ui.getByRole('heading', { name: /创建本地资料库|解锁你的资料库/ })).toBeVisible();
  return ui;
}
export async function initialize(ui: Page) {
  await ui.getByLabel('主口令', { exact: true }).fill(passphrase);
  await ui.getByLabel('再次输入主口令').fill(passphrase);
  await ui.getByRole('button', { name: '创建加密资料库', exact: true }).click();

  await ui.getByRole('button', { name: '创建第一个档案', exact: true }).click();

  await ui.getByLabel('档案名称', { exact: true }).fill('虚构测试资料');
  for (const [label, value] of [
    ['完整姓名', '乔云'],
    ['邮箱', 'qiao.yun@example.test'],
    ['国家呼叫码，如 +86', '+1'],
    ['本地号码', '2025550147'],
    ['邮政编码', '000000'],
    ['城市', '虚构市'],
    ['地址第一行', '测试路 100 号'],
    ['单位名称', '虚构示例研究室'],
  ])
    await ui.getByLabel(label, { exact: true }).fill(value);
  await ui.getByLabel('国家／地区', { exact: true }).selectOption('CN');
  await ui.getByText('敏感信息 · 出生日期', { exact: true }).click();
  await ui.getByLabel('出生日期', { exact: true }).fill('1994-04-12');
  await ui.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(ui.locator('footer [role=status]')).toHaveText('已加密保存。');
}
export async function scan(ui: Page) {
  await ui.getByRole('button', { name: '网页填写', exact: true }).click();
  await ui.getByRole('button', { name: '扫描当前目标网页', exact: true }).click();
  await expect(ui.getByRole('heading', { name: '检查本次填写' })).toBeVisible();
  await ui.getByLabel('表单分区', { exact: true }).selectOption({ index: 1 });
}
export async function rawScan(ui: Page, worker: Worker) {
  const t = await worker.evaluate(
    async () => (await chrome.storage.session.get('session')).session.target,
  );
  return await ui.evaluate(
    async (tabId) => await chrome.tabs.sendMessage(tabId, { type: 'SCAN' }, { frameId: 0 }),
    t.tabId,
  );
}
