import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { launch, action, initialize, scan, rawScan, passphrase } from './helpers';
import { englishResume, chineseResume } from '../fixtures/resume-files';
import type { ScanResult, FillPlan } from '../../src/core/protocol';
import { toB64 } from '../../src/core/crypto';
test('v2 passwordless setup, education and bilingual editing, password protection conversion', async () => {
  const { context, id, worker } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    const ui = await action(context, page, id);
    await ui.getByLabel('保护方式', { exact: true }).selectOption('device');
    await ui.getByRole('button', { name: '创建免口令资料库' }).click();
    await ui.getByRole('button', { name: '创建第一个档案' }).click();
    await ui.getByLabel('完整姓名', { exact: true }).fill('乔云');
    await ui.getByRole('button', { name: '＋ 添加教育经历 / Add education' }).click();
    let education = ui.locator('#education-editor .record-card').nth(0);
    await education.getByLabel('学校 / School · 中文', { exact: true }).fill('示例大学');
    await education
      .getByLabel('学校 / School · English', { exact: true })
      .fill('Fictional University');
    await education.getByRole('checkbox', { name: '最高学历 / Highest education' }).check();
    await education.getByRole('checkbox', { name: '当前学历 / Current education' }).check();
    await ui.getByRole('button', { name: '＋ 添加教育经历 / Add education' }).click();
    education = ui.locator('#education-editor .record-card').nth(1);
    await education.getByLabel('学校 / School · 中文', { exact: true }).fill('示例研究生院');
    await education.getByLabel('学历 2', { exact: true }).selectOption('master');
    await education.getByRole('checkbox', { name: '最高学历 / Highest education' }).check();
    await ui.getByRole('button', { name: '＋ 添加实习／工作／项目经历' }).click();
    const experience = ui.locator('.record-card').last();
    await experience.getByLabel('单位或项目 / Company · 中文').fill('示例实验室');
    await experience.getByLabel('单位或项目 / Company · English').fill('Fictional Labs');
    await experience.getByLabel('职位 / Title · 中文').fill('软件实习生');
    await experience.getByLabel('职位 / Title · English').fill('Software Intern');
    await ui.getByLabel('完整姓名 English', { exact: true }).fill('Yun Qiao');
    await ui.getByRole('button', { name: '保存资料', exact: true }).click();
    await expect(ui.locator('footer [role=status]')).toHaveText('已保存到本机（免口令）。');
    await ui.reload();
    await expect(ui.getByLabel('完整姓名', { exact: true })).toHaveValue('乔云');
    await expect(ui.getByLabel('主口令', { exact: true })).toHaveCount(0);
    const saved = await worker.evaluate(
      async () => await chrome.storage.local.get(['vault', 'deviceSecret']),
    );
    expect(typeof saved.deviceSecret).toBe('string');
    expect(JSON.stringify(saved.vault)).not.toContain('乔云');
    await page.goto('http://127.0.0.1:4317/recruiting');
    await scan(ui);
    await ui.getByLabel('表单分区', { exact: true }).selectOption({ label: '表单 1 · Education' });
    await ui.getByLabel('填写语言', { exact: true }).selectOption('en');
    await expect(
      ui
        .locator('.preview-row')
        .filter({ has: ui.getByRole('checkbox', { name: '填写 School', exact: true }) })
        .getByText('拟填值：Fictional University', { exact: true }),
    ).toHaveCount(1);
    await expect(ui.getByRole('checkbox', { name: '填写 School', exact: true })).toBeChecked();
    await expect(ui.getByRole('checkbox', { name: '填写 Degree', exact: true })).toBeChecked();
    await ui.getByRole('button', { name: /填写已选/ }).click();
    await expect(page.locator('#school-state')).toHaveText('Fictional University');
    await expect(page.locator('#degree-state')).toHaveText('bachelor');
    await expect(ui.getByRole('button', { name: '撤销本次填写' })).toHaveCount(0);
    await ui.getByRole('button', { name: '备份与安全', exact: true }).click();
    await ui.getByLabel('备份口令', { exact: true }).fill(passphrase);
    await ui.getByLabel('确认备份口令', { exact: true }).fill(passphrase);
    const download = ui.waitForEvent('download');
    await ui.getByRole('button', { name: '导出加密备份' }).click();
    await download;
    await ui.getByText('启用主口令保护', { exact: true }).click();
    await ui.getByLabel('新主口令', { exact: true }).fill(passphrase);
    await ui.getByLabel('确认新主口令', { exact: true }).fill(passphrase);
    await ui.getByRole('button', { name: '启用口令保护', exact: true }).click();
    await expect(ui.getByRole('button', { name: '立即锁定' })).toBeVisible();
    await ui.reload();
    await expect(ui.getByRole('heading', { name: '解锁你的资料库' })).toBeVisible();
    expect(
      (await worker.evaluate(async () => await chrome.storage.local.get('deviceSecret')))
        .deviceSecret,
    ).toBeNull();
  } finally {
    await context.close();
  }
});
test('PDF and DOCX are parsed locally for explicit review and retained as separate language attachments', async () => {
  const { context, id } = await launch();
  try {
    const external: string[] = [];
    context.on('request', (r) => {
      if (r.url().startsWith('http') && !r.url().startsWith('http://127.0.0.1:4317'))
        external.push(r.url());
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/');
    const ui = await action(context, page, id);
    await initialize(ui);
    await ui.getByLabel('添加并解析简历', { exact: true }).setInputFiles({
      name: '中文简历.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from(chineseResume()),
    });
    await expect(
      ui.getByText('解析完成。请核对下方建议，再手动采用；最后保存资料。', { exact: true }),
    ).toBeVisible();
    await expect(ui.getByText('学校 / School · 中文', { exact: true })).toHaveCount(0);
    await expect(ui.getByRole('button', { name: '添加为教育经历草稿' })).toBeVisible();
    await ui.getByRole('button', { name: '添加为教育经历草稿' }).first().click();
    await expect(
      ui.locator('#education-editor .record-card').first().getByLabel('学校 / School · 中文'),
    ).toHaveValue('示例大学');
    await ui.getByLabel('简历语言', { exact: true }).selectOption('en');
    await ui.getByLabel('添加并解析简历', { exact: true }).setInputFiles({
      name: 'english-resume.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(englishResume()),
    });
    await expect(
      ui.getByText('解析完成。请核对下方建议，再手动采用；最后保存资料。', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await ui.getByText('检查提取的全文 / Extracted text', { exact: true }).click();
    expect(await ui.getByLabel('简历提取文本').inputValue()).toContain('Fictional University');
    await expect(ui.getByText('中文 · 中文简历.docx', { exact: true })).toBeVisible();
    await expect(ui.getByText('English · english-resume.pdf', { exact: true })).toBeVisible();
    await ui.getByRole('button', { name: '保存资料', exact: true }).click();
    await expect(ui.locator('footer [role=status]')).toHaveText('已加密保存。');
    await ui.reload();
    await ui.getByLabel('主口令', { exact: true }).fill(passphrase);
    await ui.getByRole('button', { name: '解锁资料库', exact: true }).click();
    await expect(ui.getByText('English · english-resume.pdf', { exact: true })).toBeVisible();
    expect(external).toEqual([]);
  } finally {
    await context.close();
  }
});
test('real React Select search and non-search dropdowns, native resume upload, safe prohibited controls', async () => {
  const { context, id, worker } = await launch();
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4317/recruiting');
    const ui = await action(context, page, id);
    await initialize(ui);
    await scan(ui);
    const s = (await rawScan(ui, worker)) as ScanResult;
    const combo = s.fields.filter((f) => f.type === 'combobox');
    expect(combo.length).toBe(5);
    expect(combo.map((f) => ({ id: f.id, blocked: f.blocked }))).toEqual([
      { id: 'scroll-school', blocked: undefined },
      { id: 'country', blocked: undefined },
      { id: 'city', blocked: undefined },
      { id: 'school', blocked: undefined },
      { id: 'degree', blocked: undefined },
    ]);
    async function fillField(
      id: string,
      value: FillPlan['fields'][number]['value'],
      sourceFieldId: FillPlan['fields'][number]['sourceFieldId'],
    ) {
      const scanned = (await rawScan(ui, worker)) as ScanResult,
        f = scanned.fields.find((f) => f.id === id)!;
      expect(f).toBeTruthy();
      const plan: FillPlan = {
        protocolVersion: 1,
        operationId: crypto.randomUUID(),
        scanId: scanned.scanId,
        documentToken: scanned.documentToken,
        expectedOrigin: scanned.origin,
        expiresAt: Date.now() + 60000,
        fields: [
          {
            fieldId: f.fieldId,
            semanticFingerprint: f.semanticFingerprint,
            value,
            sourceFieldId,
            overwriteApproved: true,
            sensitiveApproved: true,
          },
        ],
      };
      return await ui.evaluate(async (plan) => {
        const { session } = await chrome.storage.session.get('session');
        return await chrome.tabs.sendMessage(
          session.target.tabId,
          { type: 'FILL', plan },
          { frameId: 0 },
        );
      }, plan);
    }
    expect((await fillField('country', 'CN', 'address.countryCode'))[0].status).toBe('written');
    await expect(page.locator('#country-state')).toHaveText('cn');
    expect((await fillField('city', '北京市', 'address.city'))[0].status).toBe('written');
    await expect(page.locator('#city-state')).toHaveText('bj');
    expect((await fillField('school', 'Fictional University', 'education.school'))[0].status).toBe(
      'written',
    );
    await expect(page.locator('#school-state')).toHaveText('Fictional University');
    expect((await fillField('degree', "Master's Degree", 'education.degree'))[0].status).toBe(
      'written',
    );
    await expect(page.locator('#degree-state')).toHaveText('master');
    expect((await fillField('degree', '博士', 'education.degree'))[0].status).toBe('written');
    await expect(page.locator('#degree-state')).toHaveText('phd');
    expect(
      (await fillField('scroll-school', 'Fictional University', 'education.school'))[0].status,
    ).toBe('written');
    await expect(page.locator('#scroll-school')).toHaveAttribute(
      'aria-valuetext',
      'Fictional University',
    );
    const file = englishResume();
    expect(
      (
        await fillField(
          'resume',
          {
            id: crypto.randomUUID(),
            language: 'en',
            name: 'english-resume.pdf',
            mime: 'application/pdf',
            size: file.length,
            dataB64: toB64(file),
          },
          'resume.file',
        )
      )[0].status,
    ).toBe('written');
    await expect(page.locator('#filename')).toHaveText('english-resume.pdf');
    expect((await fillField('otp', 'qiao.yun@example.test', 'contact.email'))[0].status).toBe(
      'skipped',
    );
    expect((await fillField('terms', true, undefined))[0].status).toBe('skipped');
    await expect(page.locator('#submits')).toHaveText('0');
    await mkdir('docs/screenshots', { recursive: true });
    await page.screenshot({ path: 'docs/screenshots/recruiting-filled.png', fullPage: true });
  } finally {
    await context.close();
  }
});
