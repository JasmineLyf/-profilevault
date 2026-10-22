import type { Profile } from './schema';
export type Language = 'zh' | 'en';
export interface FillSelection {
  language: Language;
  educationId?: string;
  experienceId?: string;
}
export const degreeLabels = {
  highSchool: { zh: '高中', en: 'High School' },
  associate: { zh: '专科', en: 'Associate Degree' },
  bachelor: { zh: '本科', en: "Bachelor's Degree" },
  master: { zh: '硕士', en: "Master's Degree" },
  doctor: { zh: '博士', en: 'Doctor of Philosophy' },
  other: { zh: '其他', en: 'Other' },
};
export const degreeAliases: Record<string, string[]> = {
  bachelor: [
    '本科',
    '学士',
    'bachelor',
    'bachelors',
    "bachelor's",
    "bachelor's degree",
    'bachelor of science',
    'bachelor of arts',
    'bsc',
    'bs',
    'ba',
  ],
  master: [
    '硕士',
    '研究生',
    'master',
    'masters',
    "master's",
    "master's degree",
    'master of science',
    'master of arts',
    'msc',
    'ms',
    'ma',
  ],
  doctor: [
    '博士',
    'phd',
    'ph d',
    'doctorate',
    'doctoral',
    'doctor of philosophy',
    'doctor of philosophy (ph.d.)',
    'ph.d.',
    'ph.d',
    'ph d',
    'doctoral degree',
    'doctorate degree',
  ],
  associate: ['专科', '大专', 'associate', 'associate degree', "associate's degree"],
  highSchool: ['高中', 'high school', 'high school diploma'],
  other: ['其他', 'other'],
};
export function selectedEducation(p: Profile, s: FillSelection) {
  return p.education?.find((e) => e.id === s.educationId);
}
export function selectedExperience(p: Profile, s: FillSelection) {
  return p.experiences?.find((e) => e.id === s.experienceId);
}
export function resumeFor(p: Profile, language: Language) {
  return p.resumes?.find((r) => r.language === language);
}
export function defaultSelection(p: Profile): FillSelection {
  return {
    language: 'zh',
    educationId:
      p.currentEducationId ??
      p.highestEducationId ??
      (p.education?.length === 1 ? p.education[0].id : undefined),
    experienceId: p.experiences?.length === 1 ? p.experiences[0].id : undefined,
  };
}
