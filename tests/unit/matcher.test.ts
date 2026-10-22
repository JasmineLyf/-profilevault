import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { match, autocomplete } from '../../src/core/matcher';
import { profileValue, uniqueOption, prepareValue } from '../../src/core/normalize';
import type { Features } from '../../src/core/protocol';
import { standardCases, forbiddenCases, ambiguousCases } from '../fixtures/matching-cases';
import { fixture } from '../fixtures/profile';
export function features(patch: Partial<Features> = {}): Features {
  return {
    fieldId: crypto.randomUUID(),
    semanticFingerprint: '',
    section: 'contact',
    label: '',
    labelledby: '',
    ariaLabel: '',
    name: '',
    id: '',
    placeholder: '',
    autocomplete: '',
    type: 'text',
    context: '',
    hasValue: false,
    maxLength: -1,
    pattern: '',
    ...patch,
  };
}
describe('deterministic matching and policy', () => {
  it('evaluates at least 120 explicitly annotated cases with required precision and coverage', () => {
    let selected = 0,
      correctSelected = 0,
      covered = 0;
    for (const [label, expected] of standardCases) {
      const result = match(features({ label }), 'https://example.test', true);
      if (result.candidateField === expected) covered++;
      if (result.decision === 'preselect') {
        selected++;
        if (result.candidateField === expected) correctSelected++;
      }
    }
    for (const label of forbiddenCases) {
      expect(
        match(features({ label, autocomplete: 'email' }), 'https://example.test', true).decision,
        label,
      ).toBe('blocked');
    }
    for (const label of ambiguousCases) {
      const result = match(features({ label }), 'https://example.test', true);
      expect(result.decision, label).not.toBe('preselect');
    }
    const report = {
      total: standardCases.length + forbiddenCases.length + ambiguousCases.length,
      standard: standardCases.length,
      selected,
      precision: correctSelected / selected,
      coverage: covered / standardCases.length,
      forbiddenPreselected: 0,
      annotationReview: '独立人工复核尚未进行',
    };
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/matching-evaluation.json', JSON.stringify(report, null, 2));
    console.info('Matching evaluation:', report);
    expect(report.total).toBeGreaterThanOrEqual(120);
    expect(report.precision).toBeGreaterThanOrEqual(0.98);
    expect(report.coverage).toBeGreaterThanOrEqual(0.8);
  });
  it('does not preselect sensitive, nonempty, HTTP, ambiguous sections or autocomplete off', () => {
    for (const patch of [
      { hasValue: true },
      { autocomplete: 'off' },
      { label: '出生日期' },
      { label: '联系人姓名', context: '联系人' },
    ])
      expect(
        match(features({ label: '邮箱', ...patch }), 'https://example.test', true).decision,
      ).not.toBe('preselect');
    expect(match(features({ label: '邮箱' }), 'http://example.test', true).decision).not.toBe(
      'preselect',
    );
    expect(match(features({ label: '邮箱' }), 'https://example.test', false).decision).not.toBe(
      'preselect',
    );
    expect(
      match(features({ label: '姓名', autocomplete: 'email' }), 'https://example.test', true)
        .decision,
    ).not.toBe('preselect');
  });
  it('requires thresholds and a leading margin; attributes and placeholders stay review only', () => {
    expect(match(features({ name: 'email' }), 'https://example.test', true).decision).toBe(
      'review',
    );
    expect(
      match(features({ placeholder: 'email' }), 'https://example.test', true).candidateField,
    ).toBeUndefined();
    expect(
      match(features({ label: '姓名', ariaLabel: '邮箱' }), 'https://example.test', true).decision,
    ).not.toBe('preselect');
    expect(autocomplete('section-a shipping home email')).toEqual({
      section: 'shipping',
      field: 'email',
    });
    expect(autocomplete('email name').field).toBe('');
  });
  it('preserves strings, does not split names or guess phone parts, refuses ambiguous select', () => {
    const p = structuredClone(fixture.profiles[0]);
    expect(profileValue(p, 'address.postalCode')).toBe('000000');
    delete p.person.familyName;
    expect(profileValue(p, 'person.familyName')).toBeUndefined();
    expect(profileValue(p, 'contact.phone', features({ autocomplete: 'tel-national' }))).toBe(
      '2025550147',
    );
    expect(
      uniqueOption(
        [
          { value: 'a', text: '中国', disabled: false },
          { value: 'b', text: '中国', disabled: false },
        ],
        'CN',
        'address.countryCode',
      ),
    ).toBeUndefined();
    expect(
      uniqueOption([{ value: 'CN', text: '中国', disabled: true }], 'CN', 'address.countryCode'),
    ).toBeUndefined();
    expect(prepareValue('000000', features({ maxLength: 3 })).value).toBeUndefined();
    expect(prepareValue('03/04/1994', features({ type: 'date' })).value).toBeUndefined();
  });
});
