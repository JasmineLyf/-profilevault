import { test, expect, type Locator, type Page } from '@playwright/test';
import { action, launch, passphrase } from './helpers';
async function tabTo(ui: Page, locator: Locator) {
  for (let i = 0; i < 80; i++) {
    if (await locator.evaluate((el) => el === document.activeElement)) return;
    await ui.keyboard.press('Tab');
  }
  throw Error('KEYBOARD_TARGET_UNREACHABLE');
}
test('keyboard core workflow and 200 percent layout', async () => {
  const { context, id } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    const ui = await action(context, page, id);
    await tabTo(ui, ui.getByLabel('主口令', { exact: true }));
    await ui.keyboard.insertText(passphrase);
    await ui.keyboard.press('Tab');
    await ui.keyboard.insertText(passphrase);
    await tabTo(ui, ui.getByRole('button', { name: '创建加密资料库', exact: true }));
    await ui.keyboard.press('Enter');
    await expect(ui.getByRole('button', { name: '创建第一个档案' })).toBeVisible();
    await tabTo(ui, ui.getByRole('button', { name: '创建第一个档案' }));
    await ui.keyboard.press('Enter');
    await expect(ui.getByLabel('完整姓名', { exact: true })).toBeVisible();
    await tabTo(ui, ui.getByLabel('完整姓名', { exact: true }));
    await ui.keyboard.insertText('乔云');
    await tabTo(ui, ui.getByRole('button', { name: '保存资料', exact: true }));
    await ui.keyboard.press('Enter');
    await expect(ui.locator('footer [role=status]')).toHaveText('已加密保存。');
    await tabTo(ui, ui.getByRole('button', { name: '网页填写', exact: true }));
    await ui.keyboard.press('Enter');
    await tabTo(ui, ui.getByRole('button', { name: '扫描当前目标网页', exact: true }));
    await ui.keyboard.press('Enter');
    await expect(ui.getByRole('heading', { name: '检查本次填写' })).toBeVisible();
    await tabTo(ui, ui.getByLabel('表单分区', { exact: true }));
    await ui.keyboard.press('ArrowDown');
    await ui.keyboard.press('Enter');
    await tabTo(ui, ui.getByRole('checkbox', { name: '填写 姓名', exact: true }));
    await expect(ui.getByRole('checkbox', { name: '填写 姓名', exact: true })).toBeChecked();
    // At 200% browser zoom the available CSS width halves. Also exercise CSS zoom
    // and ensure the actual responsive view does not horizontally overflow.
    await ui.setViewportSize({ width: 590, height: 900 });
    await ui.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    expect(
      await ui.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    await ui.evaluate(() => {
      document.documentElement.style.zoom = '1';
    });
    await ui.setViewportSize({ width: 1180, height: 900 });
    await tabTo(ui, ui.getByRole('button', { name: /填写已选/ }));
    await ui.keyboard.press('Enter');
    await expect(page.locator('#full')).toHaveValue('乔云');
    await tabTo(ui, ui.getByRole('button', { name: '撤销本次填写', exact: true }));
    await ui.keyboard.press('Enter');
    await expect(page.locator('#full')).toHaveValue('');
    await expect(page.locator('#submits')).toHaveText('0');
  } finally {
    await context.close();
  }
});
