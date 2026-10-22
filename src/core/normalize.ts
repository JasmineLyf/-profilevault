import { countryAliases, type FieldId } from './field-catalog';
import type { Profile } from './schema';
import type { Features } from './protocol';
import {
  degreeLabels,
  degreeAliases,
  selectedEducation,
  selectedExperience,
  type FillSelection,
} from './recruiting';
export function normalize(v: string) {
  return v
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/必填|请输入|请选择|required/gi, '')
    .replace(/[\p{P}\p{S}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function profileValue(
  p: Profile,
  id: FieldId,
  f?: Features,
  selection: FillSelection = { language: 'zh' },
): string | undefined {
  if (id === 'resume.file') return undefined;
  if (id.startsWith('education.')) {
    const e = selectedEducation(p, selection);
    if (!e) return;
    const key = id.split('.')[1];
    if (key === 'school' || key === 'major') return e[key]?.[selection.language];
    if (key === 'degree') return degreeLabels[e.degree][selection.language];
    if (key === 'startYear' || key === 'endYear')
      return e[key === 'startYear' ? 'startMonth' : 'endMonth']?.slice(0, 4);
    return e[key as 'startMonth' | 'endMonth'];
  }
  if (id.startsWith('experience.')) {
    const e = selectedExperience(p, selection);
    if (!e) return;
    const key = id.split('.')[1];
    if (key === 'company' || key === 'title' || key === 'description')
      return e[key]?.[selection.language];
    return e[key as 'startMonth' | 'endMonth'];
  }
  if (id === 'contact.phone') {
    const phone = p.contact.phone;
    if (!phone) return;
    const ac = f?.autocomplete.split(/\s+/).at(-1);
    if (ac === 'tel-country-code') return phone.countryCallingCode;
    if (ac === 'tel-national') return phone.nationalNumber;
    if (ac === 'tel-extension') return phone.extension;
    if (phone.extension) return undefined;
    return phone.countryCallingCode + phone.nationalNumber;
  }
  const [group, key] = id.split('.') as [
    keyof Pick<Profile, 'person' | 'contact' | 'address' | 'organization' | 'links'>,
    string,
  ];
  if (selection.language === 'en' && ['person', 'address', 'organization'].includes(group)) {
    if (['birthDate', 'countryCode', 'postalCode'].includes(key))
      return (p[group] as Record<string, string>)[key];
    const translated = p.translations?.en?.[group as 'person' | 'address' | 'organization'] as
      | Record<string, string>
      | undefined;
    return translated?.[key] ?? (id === 'person.fullName' ? p.person.latinFullName : undefined);
  }
  const val = (p[group] as Record<string, unknown>)[key];
  return typeof val === 'string' ? (id === 'contact.email' ? val.trim() : val) : undefined;
}
export const cityAliases = [
  ['北京', '北京市', 'Beijing', 'Peking'],
  ['上海', '上海市', 'Shanghai'],
  ['广州', '广州市', 'Guangzhou'],
  ['深圳', '深圳市', 'Shenzhen'],
  ['杭州', '杭州市', 'Hangzhou'],
  ['南京', '南京市', 'Nanjing'],
  ['成都', '成都市', 'Chengdu'],
  ['武汉', '武汉市', 'Wuhan'],
  ['西安', '西安市', 'Xian', "Xi'an"],
  ['苏州', '苏州市', 'Suzhou'],
  ['天津', '天津市', 'Tianjin'],
  ['重庆', '重庆市', 'Chongqing'],
  ['香港', '中国香港', 'Hong Kong'],
  ['新加坡', 'Singapore'],
  ['伦敦', 'London'],
  ['纽约', 'New York', 'New York City'],
  ['旧金山', 'San Francisco'],
  ['波士顿', 'Boston'],
  ['多伦多', 'Toronto'],
  ['悉尼', 'Sydney'],
  ['东京', 'Tokyo'],
];
export function uniqueOption(
  options: { value: string; text: string; disabled: boolean }[],
  value: string,
  field?: FieldId,
) {
  const exact = options.filter((o) => o.value === value);
  if (exact.length) return exact.length === 1 && !exact[0].disabled ? exact[0].value : undefined;
  const aliases = [
    normalize(value),
    ...(field === 'address.city'
      ? (cityAliases.find((a) => a.map(normalize).includes(normalize(value))) ?? [])
      : []),
    ...(field === 'address.countryCode' ? (countryAliases[value] ?? []) : []),
    ...(field === 'education.degree'
      ? (Object.values(degreeAliases).find((a) => a.map(normalize).includes(normalize(value))) ??
        [])
      : []),
  ];
  const matches = options.filter((o) => aliases.map(normalize).includes(normalize(o.text)));
  return matches.length === 1 && !matches[0].disabled ? matches[0].value : undefined;
}
export function prepareValue(
  value: string,
  f: Features,
  field?: FieldId,
): { value?: string; error?: string } {
  if (f.options && f.type.startsWith('select')) {
    const choice = uniqueOption(f.options, value, field);
    return choice === undefined ? { error: '没有唯一且可用的精确选项' } : { value: choice };
  }
  if (f.type === 'number') return { error: 'MVP 不填写数值输入，避免丢失前导零' };
  if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return { error: '需要明确的 ISO 日期' };
  if (f.maxLength >= 0 && value.length > f.maxLength) return { error: '超出最大长度，不截断' };
  return { value };
}
