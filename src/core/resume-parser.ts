import type { Profile } from './schema';
import { MAX_RESUME_BYTES, resumeSchema } from './schema';
import { toB64 } from './crypto';
import type { Language } from './recruiting';
import { unzipSync, strFromU8 } from 'fflate';
export interface ResumeSuggestion {
  id: string;
  label: string;
  value: string;
  kind: 'email' | 'phone' | 'name' | 'website' | 'education' | 'experience' | 'review';
}
export function suggestFromText(text: string): ResumeSuggestion[] {
  const lines = text
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean),
    out: ResumeSuggestion[] = [];
  const add = (kind: ResumeSuggestion['kind'], label: string, value: string) => {
    if (value.length <= 4000 && !out.some((s) => s.kind === kind && s.value === value))
      out.push({ id: crypto.randomUUID(), kind, label, value });
  };
  for (const email of text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
    add('email', '邮箱 / Email', email);
  for (const url of text.match(/https?:\/\/[^\s<>]+/g) ?? [])
    try {
      const u = new URL(url);
      if (['http:', 'https:'].includes(u.protocol)) add('website', '网站 / Website', url);
    } catch {
      /* not a URL */
    }
  const first = lines[0];
  if (
    first &&
    first.length <= 60 &&
    !/简历|大学|学院|教育|实习|resume|curriculum|university|education|@|\d|证|护照|password|cvv/i.test(
      first,
    )
  )
    add('name', '姓名（请核对） / Name', first);
  let inExperience = false;
  for (const line of lines) {
    if (
      /^(工作经历|实习经历|项目经历|work experience|experience|internships?|projects?)[：:\s]*$/i.test(
        line,
      )
    ) {
      inExperience = true;
      continue;
    }
    if (/^(教育经历|教育背景|education|skills|技能)[：:\s]*$/i.test(line)) {
      inExperience = false;
      continue;
    }
    if (/(?:电话|手机|phone|mobile|tel)\s*[:：]/i.test(line)) {
      const value = line.match(
        /(?:电话|手机|phone|mobile|tel)\s*[:：]\s*(\+?[\d ()-]{7,30})/i,
      )?.[1];
      if (value) add('phone', '电话（需核对国家码）', value.trim());
    }
    if (/大学|学院|university|college|institute|bachelor|master|ph\.?d|本科|硕士|博士/i.test(line))
      add('education', '教育信息（需核对拆分）', line);
    else if (
      /实习|internship|intern\b|工作经历|work experience|experience|项目经历|project/i.test(line) ||
      (inExperience && /公司|实验室|labs?\b|inc\b|ltd\b|limited|technolog/i.test(line))
    )
      add('experience', '经历信息（需核对拆分）', line);
  }
  return out.slice(0, 100);
}
export async function readResume(file: File, language: Language) {
  if (file.size === 0 || file.size > MAX_RESUME_BYTES) throw Error('RESUME_SIZE');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.name.toLowerCase().endsWith('.pdf')
    ? 'application/pdf'
    : file.name.toLowerCase().endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : undefined;
  const resume = resumeSchema.parse({
    id: crypto.randomUUID(),
    language,
    name: file.name,
    mime,
    size: bytes.length,
    dataB64: toB64(bytes),
  });
  return { resume, bytes };
}
export async function extractResumeText(
  bytes: Uint8Array,
  mime: string,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw Error('PARSER_CANCELLED');
  let text = '';
  if (mime === 'application/pdf') {
    const pdfjs = await import('pdfjs-dist');
    const port = new Worker(new URL('./pdf.worker.min.mjs', location.href), { type: 'module' });
    const worker = pdfjs.PDFWorker.create({ port });
    const task = pdfjs.getDocument({
      worker,
      data: bytes.slice(),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
      useWorkerFetch: false,
      stopAtErrors: true,
      verbosity: 0,
    });
    const timeout = setTimeout(() => void task.destroy(), 15000);
    const abort = () => {
      void task.destroy();
      port.terminate();
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > 30) throw Error('RESUME_PAGES');
      for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i),
          content = await p.getTextContent();
        let previousY: number | undefined;
        for (const item of content.items) {
          if (!('str' in item)) continue;
          const y = item.transform[5] as number;
          if (previousY !== undefined && Math.abs(y - previousY) > 3) text += '\n';
          text += item.str + ' ';
          if (item.hasEOL) text += '\n';
          previousY = y;
        }
        text += '\n';
        if (text.length > 60000) throw Error('RESUME_TEXT_SIZE');
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      await task.destroy();
      port.terminate();
    }
  } else {
    let expanded = 0;
    const entries = unzipSync(bytes, {
      filter: (file) => {
        expanded += file.originalSize;
        if (expanded > 16 * 1024 * 1024) throw Error('DOCX_EXPANDED_SIZE');
        return file.name === 'word/document.xml' && file.originalSize <= 2 * 1024 * 1024;
      },
    });
    if (!entries['word/document.xml'] || entries['word/document.xml'].length > 2 * 1024 * 1024)
      throw Error('DOCX_FORMAT');
    const xml = strFromU8(entries['word/document.xml']);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw Error('DOCX_FORMAT');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('DOCX_FORMAT');
    text = Array.from(doc.getElementsByTagNameNS('*', 'p'))
      .map((p) =>
        Array.from(p.getElementsByTagNameNS('*', 't'))
          .map((t) => t.textContent ?? '')
          .join(''),
      )
      .join('\n');
  }
  if (text.length > 60000) throw Error('RESUME_TEXT_SIZE');
  if (text.replace(/\s/g, '').length < 5) throw Error('RESUME_NO_TEXT');
  return text;
}
export function applyBasicSuggestion(
  profile: Profile,
  s: ResumeSuggestion,
  language: Language,
): Profile {
  const next = structuredClone(profile);
  if (s.kind === 'email') next.contact.email = s.value;
  if (s.kind === 'website') next.links.website = s.value;
  if (s.kind === 'name') {
    if (language === 'zh') next.person.fullName = s.value;
    else {
      next.translations ??= {};
      next.translations.en ??= {};
      next.translations.en.person ??= {};
      next.translations.en.person.fullName = s.value;
    }
  }
  return next;
}
export function educationFromLine(
  value: string,
  language: Language,
): NonNullable<Profile['education']>[number] {
  const degree = /博士|ph\.?\s?d|doctor/i.test(value)
    ? 'doctor'
    : /硕士|master|msc|m\.s\./i.test(value)
      ? 'master'
      : /本科|学士|bachelor|bsc|b\.s\./i.test(value)
        ? 'bachelor'
        : 'other';
  const school =
    value.match(/[\p{Script=Han}]{2,24}(?:大学|学院)/u)?.[0] ??
    value.match(/[A-Z][A-Za-z .&-]{1,70}\b(?:University|College|Institute)\b/)?.[0] ??
    value.match(/\b(?:University|College|Institute) of [A-Z][A-Za-z .&-]{1,50}/)?.[0];
  const dates = Array.from(
    value.matchAll(/((?:19|20)\d{2})[.\-/年](0?[1-9]|1[0-2])(?=[^\d]|$)/g),
    (m) => m[1] + '-' + m[2].padStart(2, '0'),
  );
  return {
    id: crypto.randomUUID(),
    school: { [language]: school ?? value.slice(0, 256) },
    degree,
    ...(dates[0] ? { startMonth: dates[0] } : {}),
    ...(dates[1] ? { endMonth: dates[1] } : {}),
    description: { [language]: value.slice(0, 4000) },
  };
}
export function experienceFromLine(
  value: string,
  language: Language,
): NonNullable<Profile['experiences']>[number] {
  return {
    id: crypto.randomUUID(),
    kind: /实习|intern/i.test(value)
      ? 'internship'
      : /项目|project/i.test(value)
        ? 'project'
        : 'work',
    company: { [language]: value.slice(0, 256) },
    title: {},
    description: { [language]: value.slice(0, 4000) },
    current: false,
  };
}
