import { catalog, type FieldId } from './field-catalog';
import { normalize } from './normalize';
import { blockedReason } from './policies';
import type { Features } from './protocol';
export interface MatchResult {
  fieldId: string;
  candidateField?: FieldId;
  score: number;
  runnerUpScore: number;
  reasons: string[];
  conflicts: string[];
  decision: 'preselect' | 'review' | 'unmatched' | 'blocked';
}
export function autocomplete(v: string) {
  const tokens = v.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens[0]?.startsWith('section-')) tokens.shift();
  let section = '';
  if (['shipping', 'billing'].includes(tokens[0])) section = tokens.shift()!;
  if (['home', 'work', 'mobile', 'fax', 'pager'].includes(tokens[0])) tokens.shift();
  if (tokens.at(-1) === 'webauthn') tokens.pop();
  return { field: tokens.length === 1 ? tokens[0] : '', section };
}
function compatible(f: Features, id: FieldId) {
  if (f.type === 'file') return id === 'resume.file';
  if (id === 'resume.file') return false;
  if (['checkbox', 'radio', 'search', 'number', 'select-multiple'].includes(f.type)) return false;
  if (f.type === 'date') return id === 'person.birthDate';
  if (f.type === 'month') return id.endsWith('Month');
  if (f.type === 'email') return id === 'contact.email';
  if (f.type === 'tel') return id === 'contact.phone';
  if (f.type === 'url') return id === 'links.website';
  return true;
}
export function match(f: Features, origin: string, sectionSelected: boolean): MatchResult {
  const result: MatchResult = {
    fieldId: f.fieldId,
    score: 0,
    runnerUpScore: 0,
    reasons: [],
    conflicts: [],
    decision: 'unmatched',
  };
  const blocked = f.blocked ?? blockedReason(f);
  if (blocked) return { ...result, decision: 'blocked', reasons: [blocked] };
  const ac = autocomplete(f.autocomplete);
  const scores = catalog
    .map(([id, _label, token, aliases]) => {
      const evidence: { score: number; reason: string }[] = [];
      const acMatches =
        token &&
        (ac.field === token ||
          (id === 'contact.phone' &&
            ['tel-national', 'tel-country-code', 'tel-extension'].includes(ac.field)));
      if (acMatches) evidence.push({ score: 96, reason: 'autocomplete=' + ac.field });
      for (const [source, score, label] of [
        [f.label, 90, '标签精确匹配'],
        [f.labelledby, 88, 'ARIA 引用标签'],
        [f.ariaLabel, 86, 'ARIA 标签'],
        [f.name, 74, 'name 分词'],
        [f.id, 74, 'id 分词'],
        [f.placeholder, 65, 'placeholder'],
      ] as const) {
        if (aliases.some((a) => normalize(a) === normalize(source)))
          evidence.push({ score, reason: label });
      }
      if (
        (f.type === 'email' && id === 'contact.email') ||
        (f.type === 'tel' && id === 'contact.phone') ||
        (f.type === 'url' && id === 'links.website')
      )
        evidence.push({ score: 40, reason: '仅控件类型' });
      const best = Math.max(0, ...evidence.map((e) => e.score));
      const score = compatible(f, id)
        ? Math.min(
            100,
            best +
              (evidence.length > 1 ? 5 : 0) +
              (best && ['email', 'tel', 'url', 'date'].includes(f.type) ? 3 : 0),
          )
        : 0;
      return { id, score, reasons: evidence.map((e) => e.reason) };
    })
    .sort((a, b) => b.score - a.score);
  const [top, runner] = scores;
  result.score = top.score;
  result.runnerUpScore = runner.score;
  const semanticFields = catalog
    .filter(([_id, _label, _token, aliases]) =>
      [f.label, f.labelledby, f.ariaLabel].some((t) =>
        aliases.some((a) => normalize(a) === normalize(t)),
      ),
    )
    .map((x) => x[0]);
  if (semanticFields.some((id) => id !== top.id)) {
    result.conflicts.push('标签和其他语义来源冲突');
  }
  if (/申请人|联系人|applicant|contact person/i.test(f.context + ' ' + f.label))
    result.conflicts.push('身份上下文需要确认');
  if (result.conflicts.length) result.score = Math.max(0, result.score - 20);
  if (result.score >= 70) {
    result.candidateField = top.id;
    result.reasons = top.reasons;
    result.decision = 'review';
  }
  if (
    /work experience|employment|实习|工作经历|项目经历/i.test(f.context) &&
    result.candidateField &&
    ['organization.name', 'organization.jobTitle'].includes(result.candidateField)
  ) {
    result.candidateField =
      result.candidateField === 'organization.name' ? 'experience.company' : 'experience.title';
    result.decision = 'review';
    result.reasons.push('经历分区：必须选择具体经历');
    return result;
  }
  if (
    result.score >= 90 &&
    result.score - runner.score >= 15 &&
    !result.conflicts.length &&
    top.id !== 'person.birthDate' &&
    !/^(education|experience|resume)\./.test(top.id) &&
    f.type !== 'combobox' &&
    !f.hasValue &&
    origin.startsWith('https:') &&
    sectionSelected &&
    f.autocomplete !== 'off'
  )
    result.decision = 'preselect';
  return result;
}
