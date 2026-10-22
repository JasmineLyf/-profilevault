// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractResumeText, suggestFromText } from '../../src/core/resume-parser';
import { chineseResume } from '../fixtures/resume-files';
it('extracts Chinese DOCX paragraphs locally and produces education and internship review candidates', async () => {
  const text = await extractResumeText(
    chineseResume(),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  expect(text).toContain('示例大学');
  expect(text).toContain('示例科技有限公司');
  const suggestions = suggestFromText(text);
  expect(suggestions.some((s) => s.kind === 'education')).toBe(true);
  expect(suggestions.some((s) => s.kind === 'experience' && s.value.includes('示例科技'))).toBe(
    true,
  );
  expect(suggestions.some((s) => s.kind === 'experience' && s.value === '实习经历')).toBe(false);
});
it('refuses DOCX entity declarations and excessive expanded ZIP contents', async () => {
  const malicious = zipSync({
    'word/document.xml': new Uint8Array(
      strToU8('<!DOCTYPE doc [<!ENTITY x SYSTEM "https://example.test/private">]><doc>&x;</doc>'),
    ),
  });
  await expect(extractResumeText(malicious, 'docx')).rejects.toThrow('DOCX_FORMAT');
  const oversized = zipSync({ 'word/document.xml': new Uint8Array(17 * 1024 * 1024) });
  await expect(extractResumeText(oversized, 'docx')).rejects.toThrow('DOCX_EXPANDED_SIZE');
});
it('aborts PDF parsing before creating a worker when the editor session has ended', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    extractResumeText(new Uint8Array(), 'application/pdf', controller.signal),
  ).rejects.toThrow('PARSER_CANCELLED');
});
